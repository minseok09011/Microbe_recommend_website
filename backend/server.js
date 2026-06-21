// ================================================================
// 📡 공공데이터포털 3대 핵심 API 실시간 데이터 수집 백엔드 (Render 배포용)
// ================================================================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const proj4 = require("proj4");

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
});
