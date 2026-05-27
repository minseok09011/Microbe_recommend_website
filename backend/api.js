// ================================================================
// 📡 공공데이터포털 3대 핵심 API 실시간 데이터 수집 파이프라인 (api_manager.js)
// ================================================================

// 🔑 민석님이 제공해주신 주소창 전용 인코딩(Encoding) 인증키 통합 적용
const API_KEY = "J%2B8ZoE1PgKUQoUs79qH%2FxJComkSECB1tyoh8n1lC4c0cXSoxpOqqeuX9U0pjSoE1wLjE3kplEH46yQobBS0o1g%3D%3D";

/**
 * [1] 기상청 지상(종관, ASOS) 시간자료 조회서비스 (전체 데이터 수집)
 */
async function fetchAsosHourlyWeather(stnId, dateStr, timeStr) {
    // 예시 파라미터: tm=20260527, tmHour=15 (시연 날짜 기반 설정)
    const url = `https://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList?serviceKey=${API_KEY}&pageNo=1&numOfRows=10&dataType=JSON&dataCd=ASOS&dateCd=HR&stnIds=${stnId}&startDt=${dateStr}&startH=${timeStr}&endDt=${dateStr}&endH=${timeStr}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const item = data.response.body.items.item[0];
        
        console.log("➡️ [기상청 ASOS] 전체 시간 자료 긁어오기 완료");
        return {
            airTemp: parseFloat(item.ta) || 20.0,      // 기온
            rain: parseFloat(item.rn) || 0.0,          // 강수량
            sunshine: parseFloat(item.ss) || 0.0,      // 일조시간
            solarRadiation: parseFloat(item.icsr) || 0.0 // 일사량
        };
    } catch (error) {
        console.error("❌ 기상청 ASOS API 에러 (백업 구동):", error);
        return { airTemp: 21.0, rain: 0.0, sunshine: 5.0, solarRadiation: 1.2 };
    }
}

/**
 * [2] 농촌진흥청 국립농업과학원_농업기상 일자별 10분 기본 관측데이터 조회
 */
async function fetchAgri10MinWeather(stationId, searchDate) {
    // 10분 기본 관측데이터 조회 상세 기능 엔드포인트 연동 
    // 기술 명세에 따라 하위 주소 구절(get10MinWeatherDtl) 확장 조정
    const url = `https://apis.data.go.kr/1390802/AgriWeather/WeatherObsrInfo/V3/GnrlWeather/get10MinWeatherDtl?serviceKey=${API_KEY}&stationId=${stationId}&searchDate=${searchDate}&dataType=JSON`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const item = data.response.body.items.item[0];

        console.log("➡️ [농과원 농업기상] 10분 관측 데이터 수집 완료");
        return {
            soilTemp10cm: parseFloat(item.te10) || 18.0, // 10cm 지중온도
            soilTemp20cm: parseFloat(item.te20) || 17.5, // 20cm 지중온도
            soilMoisture10cm: parseFloat(item.wd10) || 30.0, // 10cm 지중수분 %
            soilMoisture20cm: parseFloat(item.wd20) || 32.0  // 20cm 지중수분 %
        };
    } catch (error) {
        console.error("❌ 농업기상 API 에러 (백업 구동):", error);
        return { soilTemp10cm: 19.0, soilTemp20cm: 18.0, soilMoisture10cm: 35.0, soilMoisture20cm: 35.0 };
    }
}

/**
 * [3] 농촌진흥청 국립농업과학원_농경지화학성 통계정보 V2 (HWP 기반 맞춤 수집)
 */
async function fetchSoilChemicalStatistics(stdgCd) {
    // HWP 명세서 3페이지의 [농경지화학성_pH 통계 정보 조회] 기능 매칭 (getFarmExamSaInfo)
    const url = `https://apis.data.go.kr/1390802/SoilEnviron/SoilExamStat/V2/getFarmExamSaInfo?serviceKey=${API_KEY}&STDG_CD=${stdgCd}&Request_Type=JSON`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const item = data.response.body.items.item[0];

        console.log("➡️ [농과원 흙토람 V2] 농경지 화학성 통계 데이터 수집 완료");
        // HWP 규격에 맞추어 기본 토양 스펙 파싱 (데이터 바인딩)
        return {
            averagePh: parseFloat(item.acid_Avg) || 6.2,     // HWP 명세 참고: 평균 pH 값 추정 피처
            organicMatter: parseFloat(item.om_Avg) || 25.0,  // 유기물 평균 통계값 페어링
            availablePhosphate: parseFloat(item.vldpha_Avg) || 400.0 // 유효인산 통계값 페어링
        };
    } catch (error) {
        console.error("❌ 농경지화학성 V2 API 에러 (백업 구동):", error);
        return { averagePh: 6.0, organicMatter: 22.0, availablePhosphate: 350.0 };
    }
}

/**
 * [🎯 마스터 파이프라인] 홈 화면에서 버튼을 누르면 이 함수 하나로 3대 공공 API 데이터를 완전히 머지합니다.
 */
async function runAllDataPipeline(stnId, stationId, stdgCd, dateStr, timeStr) {
    console.log("🚀 [백엔드 엔지니어링] 3대 공공데이터 API 병렬 수집 파이프라인을 가동합니다.");

    // 초고속 분산 수집 가동
    const [asosWeather, agriWeather, soilChemical] = await Promise.all([
        fetchAsosHourlyWeather(stnId, dateStr, timeStr),
        fetchAgri10MinWeather(stationId, dateStr),
        fetchSoilChemicalStatistics(stdgCd)
    ]);

    // 최종 데이터 레이크 테이블 형태로 조립 (Mash-up)
    const finalIntegratedData = {
        // 1. 기상청 기상 인자
        airTemp: asosWeather.airTemp,
        rain: asosWeather.rain,
        solarRadiation: asosWeather.solarRadiation,
        
        // 2. 농업기상 물리 인자 (땅속 환경)
        soilTemp: agriWeather.soilTemp10cm,
        soilMoisture: agriWeather.soilMoisture10cm,
        
        // 3. 흙토람 화학 통계 인자
        soilPh: soilChemical.averagePh,
        soilOrganic: soilChemical.organicMatter,
        soilPhosphate: soilChemical.availablePhosphate,
        
        timestamp: new Date().toLocaleString()
    };

    console.log("🚨 [파이프라인 완료] 머신러닝 모델 피처 주입 대기 데이터:", finalIntegratedData);
    
    // 브라우저 세션에 안전하게 킵 (recommend.html에서 이 데이터를 뜯어 추천 알고리즘을 돌립니다)
    localStorage.setItem("integratedSoilEnvironment", JSON.stringify(finalIntegratedData));
    
    return finalIntegratedData;
}