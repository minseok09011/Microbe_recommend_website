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
const { calcSpraySequence } = require("./spray_sequence"); // 살포 시퀀스 계산 엔진(검증 완료, 수정 금지)

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

// POST /api/spraySequence 등에서 JSON 본문을 읽기 위한 파서
app.use(express.json({ limit: "256kb" }));

// ── [#3] 간단 rate limit (IP당 1분 30회) — 무료 쿼터(Voyage·Gemini·공공데이터) 소진 방지 ──
const rateBucket = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;
function rateLimit(req, res, next) {
    const ip = (req.headers["x-forwarded-for"] || req.ip || "unknown").toString().split(",")[0].trim();
    const now = Date.now();
    let b = rateBucket.get(ip);
    if (!b || now > b.resetAt) {
        b = { count: 0, resetAt: now + RATE_WINDOW_MS };
        rateBucket.set(ip, b);
    }
    b.count++;
    if (b.count > RATE_LIMIT) {
        return res.status(429).json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
    }
    next();
}
// 메모리 누수 방지: 만료된 IP 버킷 주기적 정리
setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of rateBucket.entries()) if (now > b.resetAt) rateBucket.delete(ip);
}, 5 * 60 * 1000).unref();

app.get("/health", (req, res) => {
    // 인덱스가 로드돼야 추천이 가능하므로 health에 반영 (모니터링이 진짜 상태를 보게)
    res.json({ status: "ok", paperIndexLoaded: !!paperVectors });
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
// 청크별 [시작, 끝] 바이트 오프셋. {idx,score} 객체 배열 대신 Int32Array 두 개로 들고 있어
// 49,003개 기준 객체 배열(~4MB)보다 메모리를 적게 씀(~400KB) — Render 메모리 한도 대응
let chunkStarts = null;
let chunkEnds = null;

// [#2] 타임아웃 있는 fetch — 공공/외부 API가 응답 없으면 매달리지 않고 끊는다 (기본 10초)
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function downloadIfMissing(url, destPath) {
    if (fs.existsSync(destPath)) return;
    console.log(`⬇️  논문 인덱스 다운로드 중: ${path.basename(destPath)}`);
    const response = await fetchWithTimeout(url);
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
        const starts = [];
        const ends = [];
        const readBuf = Buffer.alloc(1024 * 1024);
        let filePos = 0;
        let lineStart = 0;
        let bytesRead;
        while ((bytesRead = fs.readSync(fd, readBuf, 0, readBuf.length, filePos)) > 0) {
            for (let i = 0; i < bytesRead; i++) {
                if (readBuf[i] === 0x0a) {
                    const newlinePos = filePos + i;
                    if (newlinePos > lineStart) {
                        starts.push(lineStart);
                        ends.push(newlinePos);
                    }
                    lineStart = newlinePos + 1;
                }
            }
            filePos += bytesRead;
        }
        if (lineStart < filePos) {
            starts.push(lineStart);
            ends.push(filePos);
        }
        return { starts: Int32Array.from(starts), ends: Int32Array.from(ends) };
    } finally {
        fs.closeSync(fd);
    }
}

async function loadPaperIndex(attempt = 1) {
    const MAX_ATTEMPTS = 5;
    try {
        await downloadIfMissing(`${PAPER_INDEX_BASE_URL}/vectors.f32`, VECTORS_PATH);
        await downloadIfMissing(`${PAPER_INDEX_BASE_URL}/chunks.jsonl`, CHUNKS_PATH);

        const vecBuf = fs.readFileSync(VECTORS_PATH);
        paperVectors = new Float32Array(vecBuf.buffer, vecBuf.byteOffset, vecBuf.length / 4);

        const offsets = buildLineOffsetsFromFile(CHUNKS_PATH);
        chunkStarts = offsets.starts;
        chunkEnds = offsets.ends;
        chunksFd = fs.openSync(CHUNKS_PATH, "r");

        console.log(`📚 논문 인덱스 로드 완료: ${chunkStarts.length}개 청크`);
    } catch (error) {
        console.error(`❌ 논문 인덱스 로드 실패 (시도 ${attempt}/${MAX_ATTEMPTS}):`, error.message);
        if (attempt < MAX_ATTEMPTS) {
            const delayMs = Math.min(30000, 2000 * 2 ** (attempt - 1)); // 2s,4s,8s,16s,30s
            console.log(`⏳ ${delayMs / 1000}초 후 재시도...`);
            setTimeout(() => loadPaperIndex(attempt + 1), delayMs);
        } else {
            console.error("❌ 논문 인덱스 로드 최종 실패. 추천 기능을 사용할 수 없습니다.");
        }
    }
}

function getChunk(idx) {
    const start = chunkStarts[idx];
    const end = chunkEnds[idx];
    const buf = Buffer.alloc(end - start);
    fs.readSync(chunksFd, buf, 0, buf.length, start);
    return JSON.parse(buf.toString("utf-8"));
}

async function embedQuery(text) {
    const response = await fetchWithTimeout("https://api.voyageai.com/v1/embeddings", {
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

// 49,003개 전체를 {idx,score} 객체 배열로 만들어 정렬하면 요청마다 수 MB가 잠깐
// 할당되는데, 어차피 상위 k개(8개)만 필요하므로 크기 k짜리 배열만 유지하며 삽입
// 정렬하는 방식으로 바꿔 요청당 추가 메모리를 O(n) → O(k)로 줄임
function searchTopChunks(queryVector, topK) {
    const n = chunkStarts.length;
    const k = Math.min(topK, n);
    const topScores = new Array(k).fill(-Infinity);
    const topIdx = new Array(k).fill(-1);

    for (let i = 0; i < n; i++) {
        const score = cosineSimilarity(queryVector, i * VECTOR_DIM);
        if (score <= topScores[k - 1]) continue;
        let pos = k - 1;
        while (pos > 0 && topScores[pos - 1] < score) {
            topScores[pos] = topScores[pos - 1];
            topIdx[pos] = topIdx[pos - 1];
            pos--;
        }
        topScores[pos] = score;
        topIdx[pos] = i;
    }

    return topIdx.map((idx, i) => ({ ...getChunk(idx), score: topScores[i] }));
}

/**
 * [6] 실제 미생물자재 공시현황 기반 판매처 정보 (microbe_disclosure.csv)
 * 농림축산식품부 공시현황 원본(공시번호·상표명·사업자·가격·연락처·제조장주소 등)을 그대로
 * 가공한 자료입니다. 추천된 미생물 학명과 매칭해서 실제로 어느 회사에서 어떤 제품으로
 * 살 수 있는지를 함께 보여줍니다.
 *
 * 학명 표기가 갈리는 문제 대응:
 * - 같은 셀에 여러 종이 "A, B" 형태로 같이 적힌 경우 종별로 분리해서 색인
 * - 흔한 오타("subtillis" 등)는 별도 표로 교정
 * - 최근 분류 변경으로 속명이 달라진 경우(예: Lactobacillus → Lactiplantibacillus,
 *   Bacillus megaterium → Priestia megaterium 등 논문에서 흔히 쓰는 신학명)를
 *   동의어 표로 표준 학명에 매핑
 * - 위 두 표에 없는 표기 차이는, 속명이 달라도 종명(epithet)이 데이터 내에서 유일하게
 *   일치하면 보조적으로 매칭(matchType: "epithet")해 표기 차이로 못 찾는 경우를 줄임
 * - LLM이 "Bacillus spp."처럼 종까지는 특정하지 않고 속(genus) 단위로만 추천하거나,
 *   특정 종이 공시현황에 아예 없는 경우에는 같은 속(genus)의 다른 등록 제품들을
 *   모아서 보여줌(matchType: "genus")
 */
const MICROBE_DISCLOSURE_PATH = path.join(__dirname, "microbe_disclosure.csv");
let disclosureByKey = new Map(); // "genus species" -> { displayName, vendors: [...] }
let disclosureEpithetIndex = new Map(); // species epithet -> Set("genus species")
let disclosureGenusIndex = new Map(); // genus -> Set("genus species")

const SPECIES_TYPO_FIX = {
    "bacillus subtillis": "bacillus subtilis",
    "bacillus velenzensis": "bacillus velezensis",
    "bacillus thrungiensis": "bacillus thuringiensis",
};

// 재분류로 속명이 바뀌어 논문/AI가 신학명을 쓰는 경우 -> 공시현황이 쓰는 옛 학명으로 표준화
// (A등급 논문 코퍼스 49,003개 청크를 실제로 스캔해서 자주 등장하는 학명을 확인하고,
//  공시현황의 39개 종과 같은 미생물인데 표기만 다른 경우를 추려 반영함)
const SPECIES_SYNONYMS = {
    "priestia megaterium": "bacillus megaterium",
    "priestia altitudinis": "bacillus altitudinis",
    "priestia aryabhattai": "bacillus aryabhattai",
    "lactiplantibacillus plantarum": "lactobacillus plantarum",
    "lacticaseibacillus casei": "lactobacillus casei",
    "lacticaseibacillus paracasei": "lactobacillus paracasei",
    "lacticaseibacillus rhamnosus": "lactobacillus rhamnosus",
    "limosilactobacillus fermentum": "lactobacillus fermentum",
    "latilactobacillus sakei": "lactobacillus sakei",
    "bacillus polymyxa": "paenibacillus polymyxa", // 1993년 Paenibacillus 속이 분리되기 전 옛 이름
};

// ================================================================
// 🗓️ 살포 시퀀스 — 농약/친환경 위험표 + 비료·소독제 종류룰 + 균종 분류
// ================================================================
const PESTICIDE_RISK_PATH = path.join(__dirname, "pesticide_risk.csv");
const ECO_RISK_PATH = path.join(__dirname, "eco_risk.csv");

let pesticideRiskByName = new Map(); // 소문자 상표명 -> { name, b, f, family, generic }
let ecoRiskByName = new Map(); // 소문자 자재명 -> { name, b, f, family }
let sprayMaterialList = []; // 자동완성용 [{ name, type, family }]

const VALID_RISK = new Set(["🔴", "🟡", "🟢"]);
const sanitizeRisk = (r) => (VALID_RISK.has((r || "").trim()) ? (r || "").trim() : "🟡"); // 깨진 값은 안전쪽(주의)으로

// 비료·소독제는 제품DB가 없어 종류룰(상수)로 처리한다.
// ⚠️ spray_sequence.js 의 TYPE_RULES 를 그대로 반영한 사본이다(엔진은 수정 금지라 export 불가).
//    엔진의 TYPE_RULES 가 바뀌면 이 표도 같이 맞춰야 한다.
const SPRAY_TYPE_RULES = {
    fert_nitrogen: { b: "🟡", f: "🟡", family: "질소·칼리·복합비료" },
    fert_lime: { b: "🟡", f: "🟡", family: "석회·규산·고토" },
    fert_rawmanure: { b: "🟡", f: "🟡", family: "미부숙 가축분" },
    fert_compost: { b: "🟢", f: "🟢", family: "완숙퇴비·유기질·미생물" },
    fert_nutrient: { b: "🟢", f: "🟢", family: "영양제·미량요소" },
    fert_cyanamide: { b: "🔴", f: "🔴", family: "석회질소(예외)" },
    disinf_oxidizer: { b: "🔴", f: "🔴", family: "산화제계(과산화수소·과산화초산)" },
    disinf_chlorine: { b: "🔴", f: "🔴", family: "염소계(차아염소산·이산화염소)" },
    microbe: { b: "🟢", f: "🟢", family: "미생물 약제" },
    none: { b: "🟢", f: "🟢", family: "없음" },
};

function loadSprayRiskTables() {
    const loadFile = (filePath, type, targetMap) => {
        let csvText = fs.readFileSync(filePath, "utf-8");
        if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);
        const rows = parseCsv(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true });
        let n = 0;
        for (const row of rows) {
            const name = (row["상표명"] || "").trim();
            if (!name) continue;
            const entry = {
                name,
                type,
                b: sanitizeRisk(row["세균제위험"]),
                f: sanitizeRisk(row["곰팡이제위험"]),
                family: (row["계열"] || "").trim(),
                generic: (row["일반명"] || "").trim(), // 친환경표엔 없음 → ""
            };
            const key = name.toLowerCase();
            if (!targetMap.has(key)) targetMap.set(key, entry); // 동일 표 내 중복은 첫 행 채택
            sprayMaterialList.push({ name, type, family: entry.family });
            n++;
        }
        return n;
    };
    const p = loadFile(PESTICIDE_RISK_PATH, "pesticide", pesticideRiskByName);
    const e = loadFile(ECO_RISK_PATH, "eco", ecoRiskByName);
    console.log(`🧪 살포 위험표 로드 완료: 농약 ${p}건 + 친환경 ${e}건`);
}

// 상표명 → 위험값 {b, f, family}. kind 우선, 없으면 양쪽 표를 다 뒤지고, 그래도 없으면 null.
function lookupMaterialRisk(name, kind) {
    const key = (name || "").trim().toLowerCase();
    if (!key) return null;
    if (kind === "type") return SPRAY_TYPE_RULES[name] ? { ...SPRAY_TYPE_RULES[name] } : null;
    if (kind === "pesticide" && pesticideRiskByName.has(key)) return pesticideRiskByName.get(key);
    if (kind === "eco" && ecoRiskByName.has(key)) return ecoRiskByName.get(key);
    // kind 불명확/엇갈림 → 농약 → 친환경 → 종류룰 순서로 폴백
    return pesticideRiskByName.get(key) || ecoRiskByName.get(key) || (SPRAY_TYPE_RULES[name] ? { ...SPRAY_TYPE_RULES[name] } : null);
}

// 미생물 학명의 속(genus)으로 세균제/곰팡이제 판정. 모르면 "both"(보수적).
const BACTERIA_GENERA = new Set([
    "bacillus", "paenibacillus", "pseudomonas", "lactobacillus", "lactiplantibacillus", "lacticaseibacillus",
    "limosilactobacillus", "latilactobacillus", "lactococcus", "priestia", "streptomyces", "azospirillum", "rhizobium",
    "bradyrhizobium", "sinorhizobium", "mesorhizobium", "azotobacter", "burkholderia", "paraburkholderia",
    "serratia", "lysobacter", "enterobacter", "klebsiella", "gluconacetobacter", "acetobacter", "nitrobacter",
    "nitrosomonas", "rhodopseudomonas", "rhodobacter", "micrococcus", "arthrobacter", "agrobacterium",
    "photorhabdus",
]);
const FUNGUS_GENERA = new Set([
    "trichoderma", "beauveria", "metarhizium", "glomus", "funneliformis", "rhizophagus", "claroideoglomus",
    "paecilomyces", "purpureocillium", "aspergillus", "penicillium", "clonostachys", "gliocladium",
    "coniothyrium", "ampelomyces", "lecanicillium", "verticillium", "isaria", "cordyceps", "pochonia",
    "saccharomyces", "candida", "pichia", "aureobasidium", "talaromyces",
]);

function classifyInoculantSpecies(speciesName) {
    const key = canonicalSpeciesKey(speciesName); // "genus species" (소문자)
    if (!key) return "both";
    const genus = key.split(" ")[0];
    if (BACTERIA_GENERA.has(genus)) return "bacteria";
    if (FUNGUS_GENERA.has(genus)) return "fungus";
    return "both"; // 매칭 안 되면 보수적으로 둘 다
}

// 2020년 Bacillus·Lactobacillus 속이 여러 속으로 대거 재분류되면서(예: Bacillus →
// Priestia/Peribacillus/Niallia 등, Lactobacillus → Lactiplantibacillus/
// Lacticaseibacillus 등) 생긴 신생 속들. 위 SPECIES_SYNONYMS에 없는 종(예:
// "Peribacillus simplex", "Limosilactobacillus reuteri")이 추천되더라도, 적어도
// 같은 옛 속(genus) 단위 판매처로는 보조 매칭되도록 속명 자체를 별칭 처리
const GENUS_ALIASES = {
    priestia: "bacillus",
    peribacillus: "bacillus",
    cytobacillus: "bacillus",
    mesobacillus: "bacillus",
    neobacillus: "bacillus",
    metabacillus: "bacillus",
    alkalihalobacillus: "bacillus",
    niallia: "bacillus",
    heyndrickxia: "bacillus",
    weizmannia: "bacillus",
    lactiplantibacillus: "lactobacillus",
    lacticaseibacillus: "lactobacillus",
    limosilactobacillus: "lactobacillus",
    latilactobacillus: "lactobacillus",
    levilactobacillus: "lactobacillus",
    ligilactobacillus: "lactobacillus",
    furfurilactobacillus: "lactobacillus",
    secundilactobacillus: "lactobacillus",
    schleiferilactobacillus: "lactobacillus",
    paucilactobacillus: "lactobacillus",
    companilactobacillus: "lactobacillus",
};

// "Bacillus subtilis subsp. subtilis KCTC 1021" 같은 표기에서 균주/하위분류 표기를 떼어내고
// 속명+종명 두 단어만 남긴 표준 키("bacillus subtilis")로 정규화
function canonicalSpeciesKey(rawName) {
    let name = (rawName || "").trim().toLowerCase();
    name = name.replace(/\([^)]*\)/g, " ");
    name = name.replace(/\b(subsp|var|serovar|sv|pv|str|strain)\.?\s+.*$/i, "");
    name = name.replace(/[^a-z.\s]/g, " ");
    const tokens = name.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;

    let species = tokens[1] || "sp.";
    if (species === "spp." || species === "spp" || species === "sp") species = "sp.";

    let key = `${tokens[0]} ${species}`;
    key = SPECIES_TYPO_FIX[key] || key;
    key = SPECIES_SYNONYMS[key] || key;
    return key;
}

function toDisplayName(key) {
    const [genus, ...rest] = key.split(" ");
    return genus.charAt(0).toUpperCase() + genus.slice(1) + (rest.length ? " " + rest.join(" ") : "");
}

function parsePriceWon(priceText) {
    if (!priceText) return null;
    if (priceText.includes("무상")) return 0;
    const match = priceText.replace(/,/g, "").match(/(\d+)\s*원/);
    return match ? parseInt(match[1], 10) : null;
}

const UNREGISTERED_LABELS = new Set(["X", "-", "없음", ""]);

function loadMicrobeDisclosure() {
    let csvText = fs.readFileSync(MICROBE_DISCLOSURE_PATH, "utf-8");
    if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);
    const rows = parseCsv(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true });

    for (const row of rows) {
        const rawSpeciesField = (row["미생물 학명"] || "").trim();
        if (!rawSpeciesField) continue;

        const registeredLabel = (row["농약/비료등록여부"] || "").trim();
        const vendor = {
            product: (row["상표명(자재명)"] || "").trim(),
            company: (row["사업자"] || "").trim(),
            price: (row["가격"] || "").trim(),
            priceWon: parsePriceWon(row["가격"]),
            contact: (row["연락처(사업장)"] || "").trim(),
            address: (row["제조장주소"] || "").trim(),
            onlineUrl: (row["online_url"] || "").trim(), // 네이버쇼핑 등 온라인 구매 링크(없으면 빈칸 → 전화 폴백)
            registrar: (row["공시기관"] || "").trim(),
            validPeriod: (row["유효기간"] || "").trim(),
            registered: !UNREGISTERED_LABELS.has(registeredLabel),
        };

        for (const speciesPart of rawSpeciesField.split(",")) {
            const key = canonicalSpeciesKey(speciesPart);
            if (!key) continue;

            if (!disclosureByKey.has(key)) {
                disclosureByKey.set(key, { displayName: toDisplayName(key), vendors: [], funcTags: new Set() });
            }
            disclosureByKey.get(key).vendors.push(vendor);
            const funcTag = (row["기능태그"] || "").trim();
            if (funcTag) disclosureByKey.get(key).funcTags.add(funcTag);

            const [genus, epithet] = key.split(" ");
            if (epithet && epithet !== "sp.") {
                if (!disclosureEpithetIndex.has(epithet)) disclosureEpithetIndex.set(epithet, new Set());
                disclosureEpithetIndex.get(epithet).add(key);
            }
            if (!disclosureGenusIndex.has(genus)) disclosureGenusIndex.set(genus, new Set());
            disclosureGenusIndex.get(genus).add(key);
        }
    }
    console.log(`🏪 미생물 공시현황 판매처 정보 로드 완료: ${disclosureByKey.size}종 / 원본 ${rows.length}건`);
}

// 추천 후보로 줄 학명 목록(닫힌집합). 토양추천에는 토양개량/생장촉진 기능 종만 쓰고,
// 그런 종이 없으면(데이터 누락 대비) 판매처 있는 전체 종으로 폴백한다.
// 반환: 학술표기("Bacillus subtilis") 배열
function getRecommendableSpecies(soilOnly = true) {
    const all = [];
    const soil = [];
    for (const [key, entry] of disclosureByKey.entries()) {
        if (key.endsWith(" sp.")) continue; // 속 단위 키는 후보에서 제외
        all.push(entry.displayName);
        if (entry.funcTags && entry.funcTags.has("soil_improvement")) soil.push(entry.displayName);
    }
    const list = soilOnly && soil.length > 0 ? soil : all;
    return list.sort();
}

// canonicalSpeciesKey로 정규화한 추천 후보 키 집합(출력 검증용)
function getRecommendableKeySet(soilOnly = true) {
    return new Set(getRecommendableSpecies(soilOnly).map((s) => canonicalSpeciesKey(s)));
}

function findMicrobeVendorInfo(speciesName) {
    let key = canonicalSpeciesKey(speciesName);
    let entry = key ? disclosureByKey.get(key) : null;
    let matchType = "exact";

    if (!entry && key) {
        // 오타/동의어 표에 없는 표기 차이: 속명이 달라도 종명이 데이터 내에서 유일하면 매칭
        const epithet = key.split(" ")[1];
        const candidates = epithet && epithet !== "sp." && disclosureEpithetIndex.get(epithet);
        if (candidates && candidates.size === 1) {
            key = [...candidates][0];
            entry = disclosureByKey.get(key);
            matchType = "epithet";
        }
    }
    if (!entry && key) {
        // "Bacillus spp."처럼 종까지 특정하지 않거나, 특정 종이 공시현황에 없는 경우:
        // 같은 속(genus)에 등록된 다른 제품들을 모두 모아서 보여줌
        // (genus 자체가 재분류로 바뀐 신생 속이면 GENUS_ALIASES로 옛 속명을 찾아봄)
        let genus = key.split(" ")[0];
        let genusKeys = disclosureGenusIndex.get(genus);
        if (!genusKeys && GENUS_ALIASES[genus]) {
            genus = GENUS_ALIASES[genus];
            genusKeys = disclosureGenusIndex.get(genus);
        }
        if (genusKeys && genusKeys.size > 0) {
            const mergedVendors = [];
            for (const gk of genusKeys) mergedVendors.push(...disclosureByKey.get(gk).vendors);
            entry = { displayName: `${toDisplayName(genus)} spp.`, vendors: mergedVendors };
            matchType = "genus";
        }
    }
    if (!entry) return null;

    // 같은 회사가 제품 여러 개를 등록한 경우 회사 단위로 묶어서 보여줌
    const byCompany = new Map();
    for (const v of entry.vendors) {
        if (!v.company) continue;
        if (!byCompany.has(v.company)) byCompany.set(v.company, { company: v.company, products: [] });
        byCompany.get(v.company).products.push({
            product: v.product,
            price: v.price,
            contact: v.contact,
            onlineUrl: v.onlineUrl, // 있으면 온라인 구매 링크, 없으면 contact(전화)로 안내
            address: v.address,
            registrar: v.registrar,
            validPeriod: v.validPeriod,
            registered: v.registered,
        });
    }

    const priceValues = entry.vendors.map((v) => v.priceWon).filter((p) => p !== null && p > 0);

    return {
        matchedName: entry.displayName,
        matchType, // "exact" | "epithet"(종명만으로 매칭) | "genus"(같은 속의 다른 제품들로 매칭)
        productCount: entry.vendors.length,
        priceMin: priceValues.length ? Math.min(...priceValues) : null,
        priceMax: priceValues.length ? Math.max(...priceValues) : null,
        registered: entry.vendors.some((v) => v.registered),
        vendors: [...byCompany.values()],
    };
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

app.get("/api/searchPapers", rateLimit, async (req, res) => {
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
 * 3) Gemini에게 검색된 논문 근거 + 환경 데이터를 주고 추천 미생물(학명)을 정하게 한 뒤,
 *    농민이 바로 이해할 수 있는 쉬운 설명(explanation)과 논문 인용이 포함된 학술적
 *    근거(scientificEvidence)를 분리해서 생성하게 함 — 화면에서는 쉬운 설명을 기본으로
 *    보여주고, 논문 근거는 "더보기"에 접어서 보여줌
 * 4) 추천된 학명을 microbe_disclosure.csv(공시현황 원본)와 매칭해서 실제 판매처 정보를 붙임
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.1-flash-lite";

const FIELD_LABELS_KO = {
    soilPh: "토양 산도(pH)",
    soilOrganic: "유기물 함량(g/kg)",
    soilPhosphate: "유효인산(mg/kg)",
    soilPotassium: "칼륨(cmol+/kg)",
    soilCalcium: "칼슘(cmol+/kg)",
    soilMagnesium: "마그네슘(cmol+/kg)",
    soilMoisture: "토양 수분(%)",
    airTemp: "기온(°C)",
    rain: "최근 강수량(mm)",
};

function buildFarmStatsKorean(data) {
    return Object.entries(FIELD_LABELS_KO)
        .filter(([key]) => data[key] !== undefined && !Number.isNaN(data[key]))
        .map(([key, label]) => `${label}: ${data[key]}`)
        .join(", ");
}

async function generateRecommendation(crop, data, queryText, sourceChunks, candidateSpecies) {
    const sourcesText = sourceChunks
        .map((c, i) => `[${i + 1}] ${c.title} (${c.journal}, ${c.year})\n${c.text.slice(0, 800)}`)
        .join("\n\n");
    const farmStatsKorean = buildFarmStatsKorean(data);
    const candidateList = candidateSpecies.join(", ");

    const prompt = `당신은 농업 미생물 전문가입니다. 아래 농경지 환경 데이터와 관련 논문 발췌문을 보고, 이 농경지에 가장 적합한 미생물을 추천해주세요.

[작물] ${crop}
[농경지 수치] ${farmStatsKorean}
[환경 데이터 요약] ${queryText}

[관련 논문 발췌]
${sourcesText}

[추천 가능 미생물 목록 (반드시 이 안에서만 선택)]
${candidateList}

추천 규칙(엄수):
1. recommendedSpecies는 반드시 위 [추천 가능 미생물 목록]에 있는 학명만, 토씨 하나 틀리지 않게 그대로 사용한다.
2. 반드시 "속(genus)+종(species)"이 모두 포함된 정확한 학명을 사용한다. "Bacillus sp.", "Pseudomonas spp."처럼 종을 특정하지 않은 속(genus) 단위 표기는 절대 금지한다.
3. 목록에 없는 미생물은 아무리 적합해 보여도 추천하지 않는다.
4. 환경 데이터와 논문 발췌에 비추어 가장 근거가 강한 종을 1~3개 고른다.

다음 JSON 형식으로만 답변하세요 (다른 텍스트 없이):
{
  "recommendedSpecies": [
    { "species": "학명1", "reason": "이 미생물을 선정한 구체적 이유. 위 농경지 수치(산도/유기물/영양분 등)와 직접 연결지어, 농사 짓는 분이 이해할 수 있는 말투로 2~3문장." },
    { "species": "학명2", "reason": "..." }
  ],
  "explanation": "전문 용어와 논문 인용 없이, 농사 짓는 분이 바로 이해할 수 있는 쉽고 친근한 말투의 한국어로 작성. (1) 이 농경지의 토양 상태(산도, 유기물, 영양분 등)가 작물 재배에 어떤 의미인지 일상적인 표현으로 설명하고, (2) 추천한 미생물이 구체적으로 어떤 효능이 있어서 이 토양과 작물에 도움이 되는지 설명. 4~6문장.",
  "scientificEvidence": "위 추천의 과학적 근거를 위 논문 발췌를 인용([1], [2] 등)하며 전문적으로 설명. 3~5문장."
}`;

    const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 },
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

// 근거 강도 등급 — 최고 유사도(topScore) 기준 임계값 매핑.
// ⚠️ 임계값(0.72 / 0.62)은 잠정 초기값이다. 실제 점수 분포를 모르므로 응답에 raw 점수
//    (topScore·meanTop5)도 함께 반환해, 운영자가 작물별 실제 값을 보고 나중에 조정한다.
function gradeEvidenceConfidence(topScore) {
    if (topScore >= 0.72) return "strong";
    if (topScore >= 0.62) return "moderate";
    return "weak";
}

app.get("/api/recommendMicrobe", rateLimit, async (req, res) => {
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
    let evidenceScore = { topScore: 0, meanTop5: 0 };
    try {
        queryText = buildQueryText(crop, data);
        const queryVector = await embedQuery(queryText);
        // 청크는 같은 논문에서 여러 개 뽑힐 수 있어, 넉넉히(24개) 검색한 뒤 논문(doi/title) 단위로
        // 중복 제거해 서로 다른 논문 8편이 들어가도록 한다 (참고문헌 중복 방지)
        const rawChunks = searchTopChunks(queryVector, 24);
        // [근거 강도] 상위 24개 중 상위 5개 cosine score로 신뢰도 신호만 계산.
        // 추천 로직·균종 선정에는 일절 관여하지 않고, 응답에 덧붙이기만 한다.
        const top5Scores = rawChunks.slice(0, 5).map((c) => c.score).filter((s) => Number.isFinite(s));
        evidenceScore = {
            topScore: top5Scores.length ? top5Scores[0] : 0,
            meanTop5: top5Scores.length ? top5Scores.reduce((a, b) => a + b, 0) / top5Scores.length : 0,
        };
        const seen = new Set();
        sourceChunks = [];
        for (const c of rawChunks) {
            const id = (c.doi || c.title || "").trim().toLowerCase();
            if (seen.has(id)) continue;
            seen.add(id);
            sourceChunks.push(c);
            if (sourceChunks.length >= 8) break;
        }
    } catch (error) {
        console.error("❌ 논문 검색 에러:", error.message);
        return res.status(500).json({ error: "논문 검색 중 에러 발생: " + error.message });
    }

    const sources = sourceChunks.map((c) => ({ title: c.title, journal: c.journal, year: c.year, doi: c.doi }));

    try {
        const candidateSpecies = getRecommendableSpecies(true); // 토양추천: soil_improvement 종 우선
        const candidateKeySet = getRecommendableKeySet(true);

        const result = await generateRecommendation(crop, data, queryText, sourceChunks, candidateSpecies);
        const explanation = result.explanation;
        const scientificEvidence = result.scientificEvidence;
        let recommendedSpecies = Array.isArray(result.recommendedSpecies) ? result.recommendedSpecies : [];

        // 출력 검증: (1) 형식 누락 제거, (2) 속 단위(sp./spp.) 표기 제거, (3) 후보 목록(닫힌집합) 밖이면 제거
        recommendedSpecies = recommendedSpecies.filter((item) => {
            const species = item?.species;
            const key = canonicalSpeciesKey(species);
            if (!key || key.endsWith(" sp.")) return false; // 종 미특정 표기 차단
            return candidateKeySet.has(key); // 48종(토양추천 시 26종) 화이트리스트 내만 허용
        });

        const microbes = recommendedSpecies.map((item) => ({
            species: item.species,
            reason: item.reason || "",
            vendorInfo: findMicrobeVendorInfo(item.species),
        }));

        // [근거 강도] 응답에 신호만 부가(추천 결과 불변). 화이트리스트 필터 후 추천 종이
        // 비어버리면(quota 아님) 근거 부족의 강한 신호이므로 weak로 강제한다.
        let evidenceConfidence = gradeEvidenceConfidence(evidenceScore.topScore);
        if (microbes.length === 0) evidenceConfidence = "weak";

        res.json({ queryText, explanation, scientificEvidence, microbes, sources, evidenceConfidence, evidenceScore });
    } catch (error) {
        console.error("❌ 미생물 추천(LLM) 에러:", error.message);
        if (error.quotaExceeded) {
            // 무료 API 사용량 한도 초과: 에러로 막지 않고 검색된 논문만 보여줌
            return res.json({
                queryText,
                explanation: "현재 무료 API 사용량 한도에 도달하여 AI 추천 설명을 생성할 수 없습니다. 잠시 후 다시 시도해주세요.",
                microbes: [],
                sources,
                quotaExceeded: true,
                evidenceConfidence: "weak",
                evidenceScore,
            });
        }
        res.status(500).json({ error: "미생물 추천 중 에러 발생: " + error.message });
    }
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
        const response = await fetchWithTimeout(url);
        const xml = await response.text();

        if (!xml.includes("<result_Code>200</result_Code>")) {
            throw new Error(extractXmlTag(xml, "result_Msg") || xml.slice(0, 100) || "농업기상 응답 오류");
        }

        const items = xml.split("<item>").slice(1).map((chunk) => chunk.split("</item>")[0]);
        const targetItem = items.find((chunk) => extractXmlTag(chunk, "date_Time").endsWith(`${hourStr}:00`)) || items[0];

        const num = (tag, fallback) => {
            const v = parseFloat(extractXmlTag(targetItem, tag));
            return Number.isFinite(v) ? v : fallback; // 실제 0값을 기본값으로 덮어쓰지 않음
        };
        return {
            airTemp: num("tmprt_150", 20.0),
            rain: num("rn", 0.0),
            solarRadiation: num("srqty", 1.2),
            soilTemp: num("udgr_Tp_10", 18.0),
            soilMoisture: num("soil_Mitr_10", 30.0),
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

    const response = await fetchWithTimeout(url);
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
 * [3-1] 농림수산식품교육문화정보원_팜맵 조회 서비스 (좌표기반 팜맵 상세조회)
 * 토양검정 실측값과는 별개로, 위성/항공영상으로 판독한 농경지 등록 여부 자체를 확인합니다.
 * (토양검정은 "검사 기록이 있어야"만 값이 나와서, 진짜 농지인데 검사 기록이 없는 경우와
 * 농지가 아닌 경우를 구분할 수 없습니다 — 이 API는 그 둘을 구분해줌)
 * 해당 좌표에 등록된 팜맵 필지가 하나도 없으면 isFarmland: false를 반환해서, 농지가
 * 아닌 주소까지 추천이 나가는 문제를 막는 데 사용합니다.
 */
async function fetchFarmmapParcelInfo(lat, lng) {
    const [positionX, positionY] = proj4("EPSG:4326", KOREA_5179, [parseFloat(lng), parseFloat(lat)]);
    const url = `https://apis.data.go.kr/B552895/getFarmmapService/getCoordinateBasedFarmmapInfo?serviceKey=${API_KEY}&type=xml&positionX=${positionX}&positionY=${positionY}`;

    const response = await fetchWithTimeout(url);
    const xml = await response.text();
    const resultCode = extractXmlTag(xml, "resultCode");

    if (resultCode === "3") {
        // NODATA_ERROR: 해당 좌표에 등록된 팜맵 필지가 없음 (농지가 아닌 것으로 확정)
        return { isFarmland: false, landUseType: null, parcelAddress: null };
    }
    if (resultCode !== "0" && resultCode !== "00") {
        throw new Error(extractXmlTag(xml, "resultMsg") || xml.slice(0, 100) || "팜맵 조회 실패");
    }

    // totalCount 필드는 실측 결과 신뢰할 수 없음(필지가 있는데도 0으로 오는 경우 확인됨).
    // <item> 태그 존재 자체로 필지 등록 여부를 판단함
    if (!xml.includes("<item>")) {
        return { isFarmland: false, landUseType: null, parcelAddress: null };
    }

    return {
        isFarmland: true,
        landUseType: extractXmlTag(xml, "intprNm") || null, // 판독명: 밭/논/과수원 등
        parcelAddress: `${extractXmlTag(xml, "lglEmdNm")} ${extractXmlTag(xml, "lnm")}`.trim(),
    };
}

// API 호출 자체가 실패(네트워크/인증 오류 등)하면 "농지 아님"으로 단정하지 않고
// null(확인 불가)을 반환해서, 일시적 장애로 정상적인 농가 사용자를 막지 않게 함
async function resolveFarmlandCheck(lat, lng) {
    try {
        return await fetchFarmmapParcelInfo(lat, lng);
    } catch (error) {
        console.error("❌ 팜맵 필지 조회 에러:", error.message);
        return { isFarmland: null, landUseType: null, parcelAddress: null };
    }
}

/**
 * [4] 농촌진흥청 국립농업과학원_농경지화학성 통계정보 V2 (법정동 단위, 등급별 면적 통계)
 * 좌표 기반 실측값이 없을 때의 대체 추정용입니다. 그 동네(법정동) 농경지 중
 * "면적이 가장 큰 등급"을 찾아 그 등급의 대표값(중간값)으로 추정합니다.
 * 지원 작물이 모두 밭 작물(논 작물인 벼는 미지원)이라 밭(Pfld) 구간을 기본으로 사용합니다.
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
    const response = await fetchWithTimeout(url);
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

app.get("/api/getMergedData", rateLimit, async (req, res) => {
    const { stationId, lat, lng, stdgCd, dateStr, timeStr } = req.query;

    if (!lat || !lng || !dateStr || !timeStr) {
        return res.status(400).json({ error: "lat, lng, dateStr, timeStr는 필수 파라미터입니다." });
    }

    try {
        console.log("🚀 [Render 백엔드] 공공 API 병렬 수집 파이프라인 가동");

        const hourStr = timeStr.slice(0, 2); // "1200" -> "12"

        const [agriWeather, soilData, farmlandInfo] = await Promise.all([
            fetchAgriTenMinWeather(stationId, dateStr, hourStr),
            resolveSoilData(lat, lng, stdgCd),
            resolveFarmlandCheck(lat, lng),
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
            // true: 등록된 팜맵 농경지 확인됨 / false: 농경지 아님(추천 차단용) / null: 확인 실패(차단하지 않음)
            isFarmland: farmlandInfo.isFarmland,
            landUseType: farmlandInfo.landUseType,
            timestamp: new Date().toLocaleString(),
        };

        res.status(200).json(finalIntegratedData);
    } catch (error) {
        console.error("❌ 파이프라인 에러:", error);
        res.status(500).json({ error: "데이터 수집 중 서버 에러 발생: " + error.message });
    }
});

// ── 살포 자재 자동완성 ──────────────────────────────────────────
// GET /api/sprayMaterials?q=검색어&limit=10
// 농약+친환경 상표명에서 q 포함 항목을 앞글자 우선으로 정렬해 반환.
app.get("/api/sprayMaterials", rateLimit, (req, res) => {
    const q = (req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30);
    if (!q) return res.json([]);

    const ql = q.toLowerCase();
    const starts = [];
    const contains = [];
    for (const e of sprayMaterialList) {
        const idx = e.name.toLowerCase().indexOf(ql);
        if (idx === 0) starts.push(e);
        else if (idx > 0) contains.push(e);
    }
    const seen = new Set();
    const out = [];
    for (const e of starts.concat(contains)) {
        if (seen.has(e.name)) continue; // 같은 이름 중복 제거
        seen.add(e.name);
        out.push({ name: e.name, type: e.type, family: e.family });
        if (out.length >= limit) break;
    }
    res.json(out);
});

// ── 살포 시퀀스 계산 ────────────────────────────────────────────
// POST /api/spraySequence
// body: { materials:[{kind,name,appliedDate}], inoculantType, inoculantSpecies?,
//         inoculantDate?, lat?, lng?, obsrSpotCd? }
app.post("/api/spraySequence", rateLimit, async (req, res) => {
    try {
        const body = req.body || {};
        const inputMaterials = Array.isArray(body.materials) ? body.materials : [];
        const validMaterials = inputMaterials.filter((m) => m && (m.name || "").trim() && (m.appliedDate || "").trim());
        if (validMaterials.length === 0) {
            return res.status(400).json({ error: "자재 이름과 살포일을 1건 이상 입력해주세요." });
        }

        // 균종: 학명이 오면 자동 판정으로 inoculantType 덮어쓰기
        let inoculantType = body.inoculantType;
        if (body.inoculantSpecies && body.inoculantSpecies.trim()) {
            inoculantType = classifyInoculantSpecies(body.inoculantSpecies);
        }
        if (!["bacteria", "fungus", "both"].includes(inoculantType)) inoculantType = "both";

        // 각 자재를 위험값으로 변환 (못 찾으면 보수적으로 🟡/🟡 + 미확인)
        const unmatchedMaterials = [];
        const materials = validMaterials.map((m) => {
            const name = (m.name || "").trim();
            const risk = lookupMaterialRisk(name, m.kind);
            if (!risk) {
                unmatchedMaterials.push(name);
                return { name, appliedDate: m.appliedDate.trim(), bacteriaRisk: "🟡", fungusRisk: "🟡", family: "미확인", source: null };
            }
            return {
                name,
                appliedDate: m.appliedDate.trim(),
                bacteriaRisk: sanitizeRisk(risk.b),
                fungusRisk: sanitizeRisk(risk.f),
                family: risk.family || "",
                source: risk.source || null,
            };
        });

        // 현재 기온: obsrSpotCd 있으면 농업기상 10분자료에서 1개 추출(실패해도 무시)
        let currentTempC = null;
        if (body.obsrSpotCd) {
            try {
                const now = new Date();
                const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
                const hourStr = String(now.getHours()).padStart(2, "0");
                const w = await fetchAgriTenMinWeather(body.obsrSpotCd, dateStr, hourStr);
                if (w && Number.isFinite(w.airTemp)) currentTempC = w.airTemp;
            } catch (e) {
                currentTempC = null; // 기온 못 받아도 계산은 진행
            }
        }

        const inoculantDate = (body.inoculantDate || "").trim() || undefined;
        const result = calcSpraySequence(materials, inoculantType, inoculantDate, currentTempC);
        result.inoculantType = inoculantType; // UI 안내용으로 확정된 균종 종류를 함께 반환
        if (unmatchedMaterials.length) result.unmatchedMaterials = unmatchedMaterials;

        res.json(result);
    } catch (error) {
        console.error("❌ 살포 시퀀스 에러:", error);
        res.status(500).json({ error: "살포 시퀀스 계산 중 서버 에러: " + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ 백엔드 서버 실행 중: http://localhost:${PORT}`);
    loadPaperIndex();
    loadMicrobeDisclosure();
    loadSprayRiskTables();
});
