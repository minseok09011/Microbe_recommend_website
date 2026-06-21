# 농업농촌창업경진대회

토양 성분과 기후 환경에 맞는 미생물 추천 웹사이트

## 현재 구현 범위

도로명/지번 주소와 작물을 입력하면, 그 농경지의 토양·기상 데이터를 공공 API에서 실시간으로 받아오는 부분까지 구현되어 있습니다. (받아온 데이터로 미생물을 추천하는 RAG/LLM 단계는 아직 없습니다.)

## 전체 흐름

```
[브라우저: a_recommend.html]
  1. 사용자가 주소(도로명 또는 지번)와 작물을 입력
  2. 카카오 주소 검색 API로 주소 → 위경도 + 법정동코드(b_code) 변환
  3. 위경도로 전국 농업기상 관측지점(215개, js/agriStations.js) 중
     가장 가까운 지점을 매칭
  4. 백엔드(Render)에 위경도 + 관측지점코드 + 날짜/시각 전달
        ↓
[백엔드: backend/server.js, Render]
  5. 농업기상 API(10분 상세관측)로 기온·강수량·일사량·지중온도·지중수분 조회
  6. 팜맵 기반 토양검정 API(좌표 기반)로 그 지점 농지의 실측 산도·유기물·
     유효인산·유효규산·전기전도도 조회 (좌표를 EPSG:5179로 변환해서 조회)
  7. 두 결과를 합쳐 JSON으로 응답
        ↓
[브라우저]
  8. 응답 JSON을 localStorage에 저장, 콘솔(F12)에서 확인 가능
```

## 주소 처리에 대한 메모

- 다음(Daum) 우편번호 팝업은 도로명주소 위주 인덱스를 써서, 도로명주소가 없는 농지 지번(예: "전남 화순군 도암면 왕정리 441-3")을 검색하면 엉뚱한 인근 건물 지번으로 대체되는 문제가 있어 제거했습니다.
- 지금은 입력창에 주소를 직접 타이핑하면 카카오 주소 검색 API(`v2/local/search/address.json`)로 바로 좌표와 법정동코드를 함께 가져옵니다. 이 API는 도로명주소가 없는 지번도 정확히 매칭합니다.

## 사용하는 공공 API

| 데이터 | API | 조회 키 | 비고 |
|---|---|---|---|
| 기온·강수량·일사량·지중온도·지중수분 | 농촌진흥청 국립농업과학원_농업기상 조회일자별 10분 상세 관측데이터 (`getWeatherTenMinList4`) | 관측지점코드(obsr_Spot_Cd) | XML 응답만 지원. 당일 데이터는 약간 지연될 수 있음 |
| 토양 산도·유기물·유효인산·유효규산·전기전도도 | 농림수산식품교육문화정보원_팜맵기반 토양검정 조회 서비스 (`getCoordinateBasedSoilAnalsInfo`) | 좌표(EPSG:5179) | 등록된 팜맵 필지 안의 좌표여야 실측값이 나옴. 아니면 NODATA |

기상청 ASOS API는 "전날 자료까지만 제공"하는 제약 때문에 제거했고, 위 농업기상 API 하나로 기상 데이터까지 통합했습니다.

흙토람 "농경지화학성 통계정보 V2"(`getFarmExamSaInfo`, 법정동코드 기반)는 한때 사용했지만, 실제로는 pH/유기물 평균값이 아니라 등급별 면적 통계만 주는 API라는 게 확인되어 좌표 기반 팜맵 API로 교체했습니다.

## 폴더 구조

```
.
├── a_recommend.html         # 주소+작물 입력 화면 (실제 API 연동 구현됨)
├── a-1_recommend-result.html
├── b_spray.html
├── b-1_spray-result.html
├── index.html
├── css/style.css
├── js/
│   ├── app.js                # 나머지 화면들의 임시(가짜) 데이터 렌더링
│   ├── regions.js
│   └── agriStations.js       # 자동 생성된 농업기상 관측지점 좌표 목록
└── backend/                  # Render에 배포되는 Express 서버
    ├── server.js
    ├── package.json
    ├── render.yaml
    ├── .env.example
    └── scripts/
        └── buildAgriStations.js  # agriStations.js 재생성 스크립트
```

## 배포

- 프론트엔드: GitHub Pages (저장소 루트, 정적 파일)
- 백엔드: Render (Web Service, Root Directory `backend`, Build `npm install`, Start `npm start`)
- 백엔드 환경변수: `PUBLIC_DATA_API_KEY`(공공데이터포털 인증키), `ALLOWED_ORIGINS`(CORS 허용 도메인)

## 로컬 실행

```
cd backend
npm install
node server.js   # http://localhost:3000
```

`a_recommend.html`의 `backendBaseUrl`을 `http://localhost:3000`으로 바꾸면 로컬 백엔드로 테스트할 수 있습니다.

## 남은 작업

- 농지 좌표가 팜맵에 등록되어 있지 않으면 토양 데이터는 기본값으로 대체됨 (정상 동작이지만 사용자에게 안내 필요)
- 미생물 논문 RAG 검색 + LLM 설명 생성 단계 미구현
- a-1/b/b-1 화면은 아직 임시(가짜) 데이터로만 동작
