// ================================================================
// 📡 공공데이터포털 3대 핵심 API 실시간 데이터 수집 백엔드 (Render 배포용)
// ================================================================
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const express = require("express");
const cors = require("cors");
const proj4 = require("proj4");
const { parse: parseCsv } = require("csv-parse/sync");

// 농림수산식품교육문화정보원 팜맵 API가 쓰는 좌표계 (EPSG:5179, GRS80 중부원점)
const KOREA_5179 = "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.PUBLIC_DATA_API_KEY;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : "*",
    })
);

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

/**
 * [5] 논문 RAG 검색 (Voyage AI 임베딩 + 코사인 유사도)
 * A등급 논문 1,764편을 49,003개 청크로 나눠 미리 임베딩해둔 인덱스를 GitHub
 * Release에서 받아와 사용자 질의와 가장 가까운 청크를 찾습니다.
 * 메모리가 적은 Render 인스턴스에서도 돌 수 있도록, 청크 본문(167MB)은 메모리에
 * 올리지 않고 파일 디스크립터 + 줄 위치만 들고 있다가 검색 결과 상위 몇 개만
 * 그때그때 파일에서 읽어 파싱합니다. 벡터(200MB)는 코사인 유사도를 전체 스캔해야
 * 해서 어쩔 수 없이 메모리에 올립니다.
 */
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const PAPER_INDEX_BASE_URL =
    "https://github.com/minseok09011/Microbe_recommend_website/releases/download/paper-index-a-grade-v1";
const DATA_DIR = path.join(__dirname, "data");
const VECTORS_PATH = path.join(DATA_DIR, "vectors.f32");
const CHUNKS_PATH = path.join(DATA_DIR, "chunks.jsonl");
const VECTOR_DIM = 1024;

let paperVectors = null; // Float32Array, n개 x VECTOR_DIM
let chunksFd = null; // chunks.jsonl 파일 디스크립터 (랜덤 읽기용, 끝까지 열어둠)
let chunkOffsets = null; // [start, end] 배열 (줄 단위, chunks.jsonl 파일 기준 바이트 오프셋)

async function downloadIfMissing(url, destPath) {
    if (fs.existsSync(destPath)) return;
    console.log(`⬇️  논문 인덱스 다운로드 중: ${path.basename(destPath)}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`다운로드 실패 (${response.status}): ${url}`);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    // 전체 응답을 메모리에 버퍼링하지 않고 디스크로 바로 스트리밍 (메모리 절약)
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destPath));
    console.log(`✅ 다운로드 완료: ${path.basename(destPath)}`);
}

// chunks.jsonl 전체를 메모리에 올리지 않고 일정 크기씩 읽으며 줄 경계(바이트 오프셋)만 기록
function buildLineOffsetsFromFile(filePath) {
    const fd = fs.openSync(filePath, "r");
    try {
        const offsets = [];
        const readBuf = Buffer.alloc(1024 * 1024);
        let filePos = 0;
        let lineStart = 0;
        let bytesRead;
        while ((bytesRead = fs.readSync(fd, readBuf, 0, readBuf.length, filePos)) > 0) {
            for (let i = 0; i < bytesRead; i++) {
                if (readBuf[i] === 0x0a) {
                    const newlinePos = filePos + i;
                    if (newlinePos > lineStart) offsets.push([lineStart, newlinePos]);
                    lineStart = newlinePos + 1;
                }
            }
            filePos += bytesRead;
        }
        if (lineStart < filePos) offsets.push([lineStart, filePos]);
        return offsets;
    } finally {
        fs.closeSync(fd);
    }
}

async function loadPaperIndex() {
    try {
        await downloadIfMissing(`${PAPER_INDEX_BASE_URL}/vectors.f32`, VECTORS_PATH);
        await downloadIfMissing(`${PAPER_INDEX_BASE_URL}/chunks.jsonl`, CHUNKS_PATH);

        const vecBuf = fs.readFileSync(VECTORS_PATH);
        paperVectors = new Float32Array(vecBuf.buffer, vecBuf.byteOffset, vecBuf.length / 4);

        chunkOffsets = buildLineOffsetsFromFile(CHUNKS_PATH);
        chunksFd = fs.openSync(CHUNKS_PATH, "r");

        console.log(`📚 논문 인덱스 로드 완료: ${chunkOffsets.length}개 청크`);
    } catch (error) {
        console.error("❌ 논문 인덱스 로드 실패:", error.message);
    }
}

function getChunk(idx) {
    const [start, end] = chunkOffsets[idx];
    const buf = Buffer.alloc(end - start);
    fs.readSync(chunksFd, buf, 0, buf.length, start);
    return JSON.parse(buf.toString("utf-8"));
}

async function embedQuery(text) {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${VOYAGE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: [text], model: "voyage-multilingual-2", input_type: "query" }),
    });
    const data = await response.json();
    if (!data.data) throw new Error(JSON.stringify(data));
    return data.data[0].embedding;
}

function cosineSimilarity(query, vectorOffset) {
    let dot = 0,
        queryNorm = 0,
        vectorNorm = 0;
    for (let i = 0; i < VECTOR_DIM; i++) {
        const q = query[i];
        const v = paperVectors[vectorOffset + i];
        dot += q * v;
        queryNorm += q * q;
        vectorNorm += v * v;
    }
    return dot / (Math.sqrt(queryNorm) * Math.sqrt(vectorNorm));
}

function searchTopChunks(queryVector, topK) {
    const n = chunkOffsets.length;
    const scored = new Array(n);
    for (let i = 0; i < n; i++) {
        scored[i] = { idx: i, score: cosineSimilarity(queryVector, i * VECTOR_DIM) };
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(({ idx, score }) => ({ ...getChunk(idx), score }));
}

/**
 * [6] 미생물 판매처 정보 (microbe_master.csv)
 * 종(species)별 등록 제품 수, 가격대, 판매업체, 식약처 등록 여부, 용도 카테고리를 담고 있습니다.
 * 추천된 미생물 종명과 매칭해서 "어디서 살 수 있는지"를 함께 보여주는 데 사용합니다.
 */
const MICROBE_MASTER_PATH = path.join(__dirname, "microbe_master.csv");
let microbeMasterByName = new Map();

function loadMicrobeMaster() {
    let csvText = fs.readFileSync(MICROBE_MASTER_PATH, "utf-8");
    if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);
    const rows = parseCsv(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true });

    for (const row of rows) {
        const species = (row.species || "").trim();
        if (!species) continue;
        microbeMasterByName.set(species.toLowerCase(), {
            species,
            genus: row.genus || "",
            type: row.type || "",
            productCount: parseInt(row.product_count, 10) || 0,
            priceMin: parseInt(row.price_min, 10) || null,
            priceMax: parseInt(row.price_max, 10) || null,
            vendors: (row.vendors || "").split(";").map((v) => v.trim()).filter(Boolean),
            mfdsRegistered: row.mfds_registered === "TRUE",
            mfdsBrands: (row.mfds_brands || "").split(";").map((v) => v.trim()).filter(Boolean),
            categories: (row.categories || "").split(";").map((v) => v.trim()).filter(Boolean),
        });
    }
    console.log(`🧫 미생물 판매처 정보 로드 완료: ${microbeMasterByName.size}종`);
}

function findMicrobeVendorInfo(speciesName) {
    return microbeMasterByName.get((speciesName || "").trim().toLowerCase()) || null;
}

/**
 * [7] 환경 데이터를 논문 검색에 쓸 영어 질의 문장으로 변환
 * 임베딩 모델은 숫자를 직접 이해하지 못하므로, 등급(GRADE_MIDPOINTS)을 거꾸로 이용해
 * "산성/중성/알칼리성", "낮음/보통/높음" 같은 정성적 서술어로 바꿔줍니다.
 * 논문 코퍼스가 영어라서 질의도 영어로 만들어야 검색 정확도가 높습니다.
 */
const FIELD_LABELS = {
    ph: ["extremely acidic", "strongly acidic", "moderately acidic", "slightly acidic", "near neutral", "neutral to slightly alkaline"],
    om: ["very low organic matter", "low organic matter", "moderate organic matter", "adequate organic matter", "high organic matter", "very high organic matter"],
    ap: ["very low available phosphorus", "low available phosphorus", "moderate available phosphorus", "adequate available phosphorus", "high available phosphorus", "very high available phosphorus"],
    k: ["very low potassium", "low potassium", "moderate potassium", "adequate potassium", "high potassium", "very high potassium"],
    ca: ["very low calcium", "low calcium", "moderate calcium", "adequate calcium", "high calcium", "very high calcium"],
    mg: ["very low magnesium", "low magnesium", "moderate magnesium", "adequate magnesium", "high magnesium", "very high magnesium"],
};

function classify(value, midpoints, labels) {
    if (value === undefined || value === null || Number.isNaN(value)) return null;
    let nearestIdx = 0;
    let minDiff = Infinity;
    midpoints.forEach((m, i) => {
        const diff = Math.abs(value - m);
        if (diff < minDiff) {
            minDiff = diff;
            nearestIdx = i;
        }
    });
    return labels[nearestIdx];
}

function buildQueryText(crop, data) {
    const parts = [`${crop} cultivation soil`];

    const phLabel = classify(data.soilPh, GRADE_MIDPOINTS.ph, FIELD_LABELS.ph);
    if (phLabel) parts.push(`${phLabel} (pH ${data.soilPh})`);

    const omLabel = classify(data.soilOrganic, GRADE_MIDPOINTS.om, FIELD_LABELS.om);
    if (omLabel) parts.push(omLabel);

    const apLabel = classify(data.soilPhosphate, GRADE_MIDPOINTS.ap, FIELD_LABELS.ap);
    if (apLabel) parts.push(apLabel);

    const kLabel = classify(data.soilPotassium, GRADE_MIDPOINTS.k, FIELD_LABELS.k);
    if (kLabel) parts.push(kLabel);

    const caLabel = classify(data.soilCalcium, GRADE_MIDPOINTS.ca, FIELD_LABELS.ca);
    if (caLabel) parts.push(caLabel);

    const mgLabel = classify(data.soilMagnesium, GRADE_MIDPOINTS.mg, FIELD_LABELS.mg);
    if (mgLabel) parts.push(mgLabel);

    if (data.soilMoisture !== undefined) {
        const moistureLabel = data.soilMoisture < 20 ? "dry soil" : data.soilMoisture > 35 ? "wet soil" : "moderately moist soil";
        parts.push(`${moistureLabel} (soil moisture ${data.soilMoisture}%)`);
    }
    if (data.airTemp !== undefined) parts.push(`air temperature ${data.airTemp}°C`);
    if (data.rain !== undefined && data.rain > 0) parts.push(`recent rainfall ${data.rain}mm`);

    parts.push("looking for beneficial soil microbes (plant growth-promoting bacteria/fungi) suited to these conditions");

    return parts.join(", ");
}

app.get("/api/searchPapers", async (req, res) => {
    const { query, topK } = req.query;
    if (!query) return res.status(400).json({ error: "query 파라미터가 필요합니다." });
    if (!paperVectors) return res.status(503).json({ error: "논문 인덱스가 아직 로딩되지 않았습니다." });

    try {
        const queryVector = await embedQuery(query);
        const results = searchTopChunks(queryVector, parseInt(topK, 10) || 5);
        res.json({
            results: results.map((r) => ({
                title: r.title,
                journal: r.journal,
                year: r.year,
                doi: r.doi,
                score: r.score,
                excerpt: r.text.slice(0, 300),
            })),
        });
    } catch (error) {
        console.error("❌ 논문 검색 에러:", error.message);
        res.status(500).json({ error: "논문 검색 중 에러 발생: " + error.message });
    }
});

/**
 * [8] 미생물 추천 (RAG + LLM)
 * 1) 토양/기상 데이터를 영어 질의 문장으로 변환
 * 2) 논문 인덱스에서 관련 청크 검색
 * 3) Gemini에게 검색된 논문 근거 + 환경 데이터를 주고 추천 미생물(학명)과 이유를 한국어로 생성하게 함
 * 4) 추천된 학명을 microbe_master.csv와 매칭해서 판매처 정보를 붙임
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.1-flash-lite";

async function generateRecommendation(crop, data, queryText, sourceChunks) {
    const sourcesText = sourceChunks
        .map((c, i) => `[${i + 1}] ${c.title} (${c.journal}, ${c.year})\n${c.text.slice(0, 800)}`)
        .join("\n\n");

    const prompt = `당신은 농업 미생물 전문가입니다. 아래 농경지 환경 데이터와 관련 논문 발췌문을 보고, 이 농경지에 가장 적합한 미생물을 추천해주세요.

[작물] ${crop}
[환경 데이터 요약] ${queryText}

[관련 논문 발췌]
${sourcesText}

다음 JSON 형식으로만 답변하세요 (다른 텍스트 없이):
{
  "recommendedSpecies": ["학명1", "학명2"],
  "explanation": "왜 이 미생물(들)을 추천하는지, 위 논문 근거를 인용([1], [2] 등)하며 한국어로 설명. 3~5문장."
}`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" },
            }),
        }
    );

    const data2 = await response.json();

    if (data2?.error) {
        const err = new Error(data2.error.message || JSON.stringify(data2.error));
        if (data2.error.code === 429 || data2.error.status === "RESOURCE_EXHAUSTED") err.quotaExceeded = true;
        throw err;
    }

    const text = data2?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(JSON.stringify(data2));

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("LLM 응답에서 JSON을 찾을 수 없음: " + text);
    return JSON.parse(jsonMatch[0]);
}

app.get("/api/recommendMicrobe", async (req, res) => {
    const { crop } = req.query;
    if (!crop) return res.status(400).json({ error: "crop 파라미터가 필요합니다." });
    if (!paperVectors) return res.status(503).json({ error: "논문 인덱스가 아직 로딩되지 않았습니다." });

    const data = {
        soilPh: parseFloat(req.query.soilPh),
        soilOrganic: parseFloat(req.query.soilOrganic),
        soilPhosphate: parseFloat(req.query.soilPhosphate),
        soilPotassium: parseFloat(req.query.soilPotassium),
        soilCalcium: parseFloat(req.query.soilCalcium),
        soilMagnesium: parseFloat(req.query.soilMagnesium),
        soilMoisture: parseFloat(req.query.soilMoisture),
        airTemp: parseFloat(req.query.airTemp),
        rain: parseFloat(req.query.rain),
    };

    let queryText, sourceChunks;
    try {
        queryText = buildQueryText(crop, data);
        const queryVector = await embedQuery(queryText);
        sourceChunks = searchTopChunks(queryVector, 8);
    } catch (error) {
        console.error("❌ 논문 검색 에러:", error.message);
        return res.status(500).json({ error: "논문 검색 중 에러 발생: " + error.message });
    }

    const sources = sourceChunks.map((c) => ({ title: c.title, journal: c.journal, year: c.year, doi: c.doi }));

    try {
        const { recommendedSpecies, explanation } = await generateRecommendation(crop, data, queryText, sourceChunks);
        const microbes = recommendedSpecies.map((species) => ({
            species,
            vendorInfo: findMicrobeVendorInfo(species),
        }));

        res.json({ queryText, explanation, microbes, sources });
    } catch (error) {
        console.error("❌ 미생물 추천(LLM) 에러:", error.message);
        if (error.quotaExceeded) {
            // 무료 API 사용량 한도 초과: 에러로 막지 않고 검색된 논문만 보여줌
            return res.json({
                queryText,
                explanation: "현재 무료 API 사용량 한도에 도달하여 AI 추천 설명을 생성할 수 없습니다. 아래 관련 논문을 참고하시거나 잠시 후 다시 시도해주세요.",
                microbes: [],
                sources,
                quotaExceeded: true,
            });
        }
        res.status(500).json({ error: "미생물 추천 중 에러 발생: " + error.message });
    }
});

// 진단용: 키 값 자체는 노출하지 않고 설정 여부/길이만 확인
app.get("/debug-env", (req, res) => {
    res.json({
        hasApiKey: !!API_KEY,
        apiKeyLength: (API_KEY || "").length,
    });
});

/**
 * [1] 농촌진흥청 국립농업과학원_농업기상 조회일자별 10분 상세 관측데이터 조회
 * (이 API는 XML만 응답하므로 필요한 태그만 직접 추출합니다)
 * 기온·강수량·일사량까지 이 API 하나로 받아옵니다 (기상청 ASOS는 전날 자료까지만
 * 제공해서 제외했습니다 — 이 API도 당일 데이터는 약간 지연될 수 있습니다)
 */
function extractXmlTag(xml, tag) {
    if (!xml) return "";
    const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return match ? match[1].trim() : "";
}

async function fetchAgriTenMinWeather(obsrSpotCd, dateStr, hourStr) {
    const date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    const url = `https://apis.data.go.kr/1390802/AgriWeather/WeatherObsrInfo/V4/InsttWeather/getWeatherTenMinList4?serviceKey=${API_KEY}&Page_No=1&Page_Size=144&date=${date}&obsr_Spot_Cd=${obsrSpotCd}`;

    try {
        const response = await fetch(url);
        const xml = await response.text();

        if (!xml.includes("<result_Code>200</result_Code>")) {
            throw new Error(extractXmlTag(xml, "result_Msg") || xml.slice(0, 100) || "농업기상 응답 오류");
        }

        const items = xml.split("<item>").slice(1).map((chunk) => chunk.split("</item>")[0]);
        const targetItem = items.find((chunk) => extractXmlTag(chunk, "date_Time").endsWith(`${hourStr}:00`)) || items[0];

        return {
            airTemp: parseFloat(extractXmlTag(targetItem, "tmprt_150")) || 20.0,
            rain: parseFloat(extractXmlTag(targetItem, "rn")) || 0.0,
            solarRadiation: parseFloat(extractXmlTag(targetItem, "srqty")) || 1.2,
            soilTemp: parseFloat(extractXmlTag(targetItem, "udgr_Tp_10")) || 18.0,
            soilMoisture: parseFloat(extractXmlTag(targetItem, "soil_Mitr_10")) || 30.0,
        };
    } catch (error) {
        console.error("❌ 농업기상 API 에러 (백업 구동):", error.message);
        return { airTemp: 21.0, rain: 0.0, solarRadiation: 1.2, soilTemp: 19.0, soilMoisture: 35.0 };
    }
}

/**
 * [3] 농림수산식품교육문화정보원_팜맵기반 토양검정 조회 서비스 (좌표 기반, 실측값)
 * 입력 위경도(WGS84)를 팜맵 좌표계(EPSG:5179)로 변환한 뒤, 해당 농지 필지의
 * 가장 최근 토양검정 실측값(산도·유기물·유효인산·유효규산·전기전도도)을 가져옵니다.
 * 등록된 필지가 아니면 에러를 던지므로, 호출하는 쪽에서 다음 단계(지역 추정)로 넘어갑니다.
 */
async function fetchSoilAnalysis(lat, lng) {
    const [positionX, positionY] = proj4("EPSG:4326", KOREA_5179, [parseFloat(lng), parseFloat(lat)]);
    const url = `https://apis.data.go.kr/B552895/rest/farmmap/getFarmmapSoilAnalysisService/getCoordinateBasedSoilAnalsInfo?serviceKey=${API_KEY}&numOfRows=1&pageNo=1&type=xml&positionX=${positionX}&positionY=${positionY}`;

    const response = await fetch(url);
    const xml = await response.text();

    if (!xml.includes("<resultCode>0</resultCode>")) {
        throw new Error(extractXmlTag(xml, "resultMsg") || xml.slice(0, 100) || "토양 실측 데이터 없음");
    }

    return {
        soilPh: parseFloat(extractXmlTag(xml, "acidity")) || 6.0,
        soilOrganic: parseFloat(extractXmlTag(xml, "ormtCont")) || 22.0,
        soilPhosphate: parseFloat(extractXmlTag(xml, "vdphdy")) || 350.0,
        soilSilicate: parseFloat(extractXmlTag(xml, "vdsidy")) || 0.0,
        soilEc: parseFloat(extractXmlTag(xml, "ecd")) || 0.0,
    };
}

/**
 * [4] 농촌진흥청 국립농업과학원_농경지화학성 통계정보 V2 (법정동 단위, 등급별 면적 통계)
 * 좌표 기반 실측값이 없을 때의 대체 추정용입니다. 그 동네(법정동) 농경지 중
 * "면적이 가장 큰 등급"을 찾아 그 등급의 대표값(중간값)으로 추정합니다.
 * 작물(토마토/고추/오이/상추)이 모두 밭 작물이라 밭(Pfld) 구간을 기본으로 사용합니다.
 * 유효규산은 이 API가 논(Rfld) 구간만 제공해 그것을 사용합니다.
 */
const GRADE_MIDPOINTS = {
    ph: [4.0, 4.8, 5.3, 5.8, 6.3, 7.0],
    om: [5, 15, 25, 35, 45, 55],
    ap: [100, 250, 350, 450, 550, 700],
    k: [0.15, 0.35, 0.45, 0.55, 0.65, 0.85],
    ca: [1.5, 3.5, 4.5, 5.5, 6.5, 8.0],
    mg: [0.25, 0.8, 1.3, 1.8, 2.3, 3.0],
    sa: [25, 75, 125, 175, 225, 300],
};

async function fetchSoilGradeStat(operation, stdgCd) {
    const url = `https://apis.data.go.kr/1390802/SoilEnviron/SoilExamStat/V2/${operation}?serviceKey=${API_KEY}&STDG_CD=${stdgCd}`;
    const response = await fetch(url);
    const xml = await response.text();
    if (!xml.includes("<result_Code>200</result_Code>")) {
        throw new Error(extractXmlTag(xml, "result_Msg") || "통계 데이터 없음");
    }
    return xml;
}

// 같은 성분의 6개 등급 면적 중 가장 넓은 등급의 대표값(중간값)을 고른다
function pickModalMidpoint(xml, fieldPrefix, category, midpoints) {
    const areas = [1, 2, 3, 4, 5, 6].map((n) => parseFloat(extractXmlTag(xml, `${fieldPrefix}_${category}${n}_Area`)) || 0);
    const total = areas.reduce((a, b) => a + b, 0);
    if (total === 0) return null;

    let maxIdx = 0;
    for (let i = 1; i < areas.length; i++) {
        if (areas[i] > areas[maxIdx]) maxIdx = i;
    }
    return midpoints[maxIdx];
}

async function fetchSoilGradeEstimate(stdgCd) {
    const [phXml, omXml, apXml, kXml, caXml, mgXml, saXml] = await Promise.all([
        fetchSoilGradeStat("getFarmExamPhInfo", stdgCd).catch(() => null),
        fetchSoilGradeStat("getFarmExamOmInfo", stdgCd).catch(() => null),
        fetchSoilGradeStat("getFarmExamApInfo", stdgCd).catch(() => null),
        fetchSoilGradeStat("getFarmExamKalInfo", stdgCd).catch(() => null),
        fetchSoilGradeStat("getFarmExamCalInfo", stdgCd).catch(() => null),
        fetchSoilGradeStat("getFarmExamMgInfo", stdgCd).catch(() => null),
        fetchSoilGradeStat("getFarmExamSaInfo", stdgCd).catch(() => null),
    ]);

    const soilPh = phXml && pickModalMidpoint(phXml, "acid", "Pfld", GRADE_MIDPOINTS.ph);
    const soilOrganic = omXml && pickModalMidpoint(omXml, "om", "Pfld", GRADE_MIDPOINTS.om);
    const soilPhosphate = apXml && pickModalMidpoint(apXml, "vldpha", "Pfld", GRADE_MIDPOINTS.ap);
    const soilPotassium = kXml && pickModalMidpoint(kXml, "posifertk", "Pfld", GRADE_MIDPOINTS.k);
    const soilCalcium = caXml && pickModalMidpoint(caXml, "posifertca", "Pfld", GRADE_MIDPOINTS.ca);
    const soilMagnesium = mgXml && pickModalMidpoint(mgXml, "posifertmg", "Pfld", GRADE_MIDPOINTS.mg);
    const soilSilicate = saXml && pickModalMidpoint(saXml, "vldsia", "Rfld", GRADE_MIDPOINTS.sa);

    if (!soilPh && !soilOrganic && !soilPhosphate) {
        throw new Error("지역 등급 통계 데이터 없음");
    }

    return {
        soilPh: soilPh || 6.0,
        soilOrganic: soilOrganic || 22.0,
        soilPhosphate: soilPhosphate || 350.0,
        soilSilicate: soilSilicate || 0.0,
        soilPotassium: soilPotassium || 0.0,
        soilCalcium: soilCalcium || 0.0,
        soilMagnesium: soilMagnesium || 0.0,
    };
}

// 1순위: 좌표 기반 실측값 → 2순위: 법정동 등급 통계 추정값 → 3순위: 전국 평균 고정값
async function resolveSoilData(lat, lng, stdgCd) {
    try {
        const exact = await fetchSoilAnalysis(lat, lng);
        return { ...exact, soilDataSource: "실측값" };
    } catch (error) {
        console.error("❌ 팜맵 실측 토양검정 에러:", error.message);
    }

    if (stdgCd) {
        try {
            const estimate = await fetchSoilGradeEstimate(stdgCd);
            return { ...estimate, soilEc: 0.0, soilDataSource: "지역 추정값" };
        } catch (error) {
            console.error("❌ 법정동 등급 통계 에러:", error.message);
        }
    }

    return {
        soilPh: 6.0,
        soilOrganic: 22.0,
        soilPhosphate: 350.0,
        soilSilicate: 0.0,
        soilEc: 0.0,
        soilPotassium: 0.0,
        soilCalcium: 0.0,
        soilMagnesium: 0.0,
        soilDataSource: "전국 평균값",
    };
}

app.get("/api/getMergedData", async (req, res) => {
    const { stationId, lat, lng, stdgCd, dateStr, timeStr } = req.query;

    if (!lat || !lng || !dateStr || !timeStr) {
        return res.status(400).json({ error: "lat, lng, dateStr, timeStr는 필수 파라미터입니다." });
    }

    try {
        console.log("🚀 [Render 백엔드] 공공 API 병렬 수집 파이프라인 가동");

        const hourStr = timeStr.slice(0, 2); // "1200" -> "12"

        const [agriWeather, soilData] = await Promise.all([
            fetchAgriTenMinWeather(stationId, dateStr, hourStr),
            resolveSoilData(lat, lng, stdgCd),
        ]);

        const finalIntegratedData = {
            airTemp: agriWeather.airTemp,
            rain: agriWeather.rain,
            solarRadiation: agriWeather.solarRadiation,
            soilTemp: agriWeather.soilTemp,
            soilMoisture: agriWeather.soilMoisture,
            soilPh: soilData.soilPh,
            soilOrganic: soilData.soilOrganic,
            soilPhosphate: soilData.soilPhosphate,
            soilSilicate: soilData.soilSilicate,
            soilEc: soilData.soilEc,
            soilPotassium: soilData.soilPotassium || 0.0,
            soilCalcium: soilData.soilCalcium || 0.0,
            soilMagnesium: soilData.soilMagnesium || 0.0,
            soilDataSource: soilData.soilDataSource,
            timestamp: new Date().toLocaleString(),
        };

        res.status(200).json(finalIntegratedData);
    } catch (error) {
        console.error("❌ 파이프라인 에러:", error);
        res.status(500).json({ error: "데이터 수집 중 서버 에러 발생: " + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ 백엔드 서버 실행 중: http://localhost:${PORT}`);
    loadPaperIndex();
    loadMicrobeMaster();
});
