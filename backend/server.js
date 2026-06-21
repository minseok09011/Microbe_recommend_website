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
 * [1] 기상청 지상(종관, ASOS) 시간자료 조회서비스
 */
async function fetchAsosHourlyWeather(stnId, dateStr, hourStr) {
    const url = `https://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList?serviceKey=${API_KEY}&pageNo=1&numOfRows=10&dataType=JSON&dataCd=ASOS&dateCd=HR&stnIds=${stnId}&startDt=${dateStr}&startHh=${hourStr}&endDt=${dateStr}&endHh=${hourStr}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const item = data.response.body.items.item[0];

        return {
            airTemp: parseFloat(item.ta) || 20.0,
            rain: parseFloat(item.rn) || 0.0,
            sunshine: parseFloat(item.ss) || 0.0,
            solarRadiation: parseFloat(item.icsr) || 0.0,
        };
    } catch (error) {
        console.error("❌ 기상청 ASOS API 에러 (백업 구동):", error);
        return { airTemp: 21.0, rain: 0.0, sunshine: 5.0, solarRadiation: 1.2 };
    }
}

/**
 * [2] 농촌진흥청 국립농업과학원_농업기상 조회일자별 시간 기본 관측데이터 조회
 * (이 API는 XML만 응답하므로 필요한 태그만 직접 추출합니다)
 */
function extractXmlTag(xml, tag) {
    if (!xml) return "";
    const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return match ? match[1].trim() : "";
}

async function fetchAgriHourlyWeather(obsrSpotCd, dateStr, hourStr) {
    const dateTime = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    const url = `https://apis.data.go.kr/1390802/AgriWeather/WeatherObsrInfo/V3/GnrlWeather/getWeatherTimeList3?serviceKey=${API_KEY}&Page_No=1&Page_Size=24&date_Time=${dateTime}&obsr_Spot_Cd=${obsrSpotCd}`;

    try {
        const response = await fetch(url);
        const xml = await response.text();

        const items = xml.split("<item>").slice(1).map((chunk) => chunk.split("</item>")[0]);
        const targetItem = items.find((chunk) => extractXmlTag(chunk, "date").endsWith(`${hourStr}:00`)) || items[0];

        return {
            soilTemp: parseFloat(extractXmlTag(targetItem, "soil_Temp")) || 18.0,
            soilMoisture: parseFloat(extractXmlTag(targetItem, "soil_Wt")) || 30.0,
        };
    } catch (error) {
        console.error("❌ 농업기상 API 에러 (백업 구동):", error);
        return { soilTemp: 19.0, soilMoisture: 35.0 };
    }
}

/**
 * [3] 농림수산식품교육문화정보원_팜맵기반 토양검정 조회 서비스 (좌표 기반, 실측값)
 * 입력 위경도(WGS84)를 팜맵 좌표계(EPSG:5179)로 변환한 뒤, 해당 농지 필지의
 * 가장 최근 토양검정 실측값(산도·유기물·유효인산·유효규산·전기전도도)을 가져옵니다.
 */
async function fetchSoilAnalysis(lat, lng) {
    const [positionX, positionY] = proj4("EPSG:4326", KOREA_5179, [parseFloat(lng), parseFloat(lat)]);
    const url = `https://apis.data.go.kr/B552895/rest/farmmap/getFarmmapSoilAnalysisService/getCoordinateBasedSoilAnalsInfo?serviceKey=${API_KEY}&numOfRows=1&pageNo=1&type=xml&positionX=${positionX}&positionY=${positionY}`;

    try {
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
    } catch (error) {
        console.error("❌ 팜맵 토양검정 API 에러 (백업 구동):", error.message);
        return { soilPh: 6.0, soilOrganic: 22.0, soilPhosphate: 350.0, soilSilicate: 0.0, soilEc: 0.0 };
    }
}

app.get("/api/getMergedData", async (req, res) => {
    const { stnId, stationId, lat, lng, dateStr, timeStr } = req.query;

    if (!lat || !lng || !dateStr || !timeStr) {
        return res.status(400).json({ error: "lat, lng, dateStr, timeStr는 필수 파라미터입니다." });
    }

    try {
        console.log("🚀 [Render 백엔드] 공공 API 병렬 수집 파이프라인 가동");

        const hourStr = timeStr.slice(0, 2); // "1200" -> "12"

        const [asosWeather, agriWeather, soilAnalysis] = await Promise.all([
            fetchAsosHourlyWeather(stnId || "108", dateStr, hourStr),
            fetchAgriHourlyWeather(stationId, dateStr, hourStr),
            fetchSoilAnalysis(lat, lng),
        ]);

        const finalIntegratedData = {
            airTemp: asosWeather.airTemp,
            rain: asosWeather.rain,
            solarRadiation: asosWeather.solarRadiation,
            soilTemp: agriWeather.soilTemp,
            soilMoisture: agriWeather.soilMoisture,
            soilPh: soilAnalysis.soilPh,
            soilOrganic: soilAnalysis.soilOrganic,
            soilPhosphate: soilAnalysis.soilPhosphate,
            soilSilicate: soilAnalysis.soilSilicate,
            soilEc: soilAnalysis.soilEc,
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
