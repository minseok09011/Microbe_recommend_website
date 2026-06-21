// ================================================================
// 📡 공공데이터포털 3대 핵심 API 실시간 데이터 수집 백엔드 (Render 배포용)
// ================================================================
require("dotenv").config();
const express = require("express");
const cors = require("cors");

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
 * [3] 농촌진흥청 국립농업과학원_농경지화학성 통계정보 V2
 */
async function fetchSoilChemicalStatistics(stdgCd) {
    const url = `https://apis.data.go.kr/1390802/SoilEnviron/SoilExamStat/V2/getFarmExamSaInfo?serviceKey=${API_KEY}&STDG_CD=${stdgCd}&Request_Type=JSON`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const item = data.response.body.items.item[0];

        return {
            averagePh: parseFloat(item.acid_Avg) || 6.2,
            organicMatter: parseFloat(item.om_Avg) || 25.0,
            availablePhosphate: parseFloat(item.vldpha_Avg) || 400.0,
        };
    } catch (error) {
        console.error("❌ 농경지화학성 V2 API 에러 (백업 구동):", error);
        return { averagePh: 6.0, organicMatter: 22.0, availablePhosphate: 350.0 };
    }
}

app.get("/api/getMergedData", async (req, res) => {
    const { stnId, stationId, stdgCd, dateStr, timeStr } = req.query;

    if (!stdgCd || !dateStr || !timeStr) {
        return res.status(400).json({ error: "stdgCd, dateStr, timeStr는 필수 파라미터입니다." });
    }

    try {
        console.log("🚀 [Render 백엔드] 공공 API 병렬 수집 파이프라인 가동");

        const hourStr = timeStr.slice(0, 2); // "1200" -> "12"

        const [asosWeather, agriWeather, soilChemical] = await Promise.all([
            fetchAsosHourlyWeather(stnId || "108", dateStr, hourStr),
            fetchAgriHourlyWeather(stationId, dateStr, hourStr),
            fetchSoilChemicalStatistics(stdgCd),
        ]);

        const finalIntegratedData = {
            airTemp: asosWeather.airTemp,
            rain: asosWeather.rain,
            solarRadiation: asosWeather.solarRadiation,
            soilTemp: agriWeather.soilTemp,
            soilMoisture: agriWeather.soilMoisture,
            soilPh: soilChemical.averagePh,
            soilOrganic: soilChemical.organicMatter,
            soilPhosphate: soilChemical.availablePhosphate,
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
