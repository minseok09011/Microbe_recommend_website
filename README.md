https://tobio.pages.dev/
# 농업농촌창업경진대회

토양 성분과 기후 환경에 맞는 미생물 추천 웹사이트

## 현재 구현 범위

도로명/지번 주소와 작물을 입력하면, 그 주소가 실제 등록된 농경지인지 먼저 확인하고, 그 농경지의 토양·기상 데이터를 공공 API에서 실시간으로 받아옵니다. 그 데이터를 바탕으로 A등급 논문 1,764편 중 관련 근거를 검색해 LLM이 추천 미생물을 정하고, 농민이 바로 이해할 수 있는 쉬운 설명과 실제 판매처 정보를 보여줍니다(논문 인용이 들어간 학술적 근거는 "더보기"에 따로 숨겨둠).

## 전체 흐름

```
[브라우저: a_recommend.html]
  1. 사용자가 주소(도로명 또는 지번)와 작물을 입력
  2. 카카오 주소 검색 API(v2/local/search/address.json)로
     주소 → 위경도 + 법정동코드(b_code) 변환
  3. 위경도로 전국 농업기상 관측지점(215개, js/agriStations.js) 중
     가장 가까운 지점을 매칭
  4. 백엔드(Render)에 위경도 + 법정동코드 + 관측지점코드 + 날짜/시각 전달
        ↓
[백엔드: backend/server.js, Render — /api/getMergedData]
  5. 농업기상 API(10분 상세관측)로 기온·강수량·일사량·지중온도·지중수분 조회
  6. 토양 데이터는 정밀도 순으로 3단계로 조회:
     a) 좌표 기반 팜맵 토양검정 API로 그 필지의 실측값 조회 (있으면 사용)
     b) 없으면, 법정동 단위 등급별 면적 통계에서 그 동네 밭(작물 재배지) 중
        면적이 가장 큰 등급을 찾아 대표값(중간값)으로 추정
     c) 그래도 없으면 전국 평균 고정값 사용
  7. 별도로 팜맵 조회 서비스(좌표기반 팜맵 상세조회)로 그 좌표에 위성/항공영상
     기준 등록된 농경지 필지가 있는지 확인 (isFarmland: true/false/null).
     토양검정과 달리 "검사 기록 유무"가 아니라 "농경지 자체의 존재 여부"를 보는
     것이라, 농지인데 검사 기록만 없는 경우와 농지가 아닌 경우를 구분해줌
  8. 위 결과를 합쳐 JSON으로 응답 (토양 데이터 출처는 soilDataSource 필드로
     "실측값"/"지역 추정값"/"전국 평균값" 표시)
        ↓
[브라우저]
  9. isFarmland === false면 추천을 진행하지 않고 "농경지가 아닙니다" 에러를
     표시. null(팜맵 조회 자체가 실패)이면 차단하지 않고 그대로 진행
  10. 응답 JSON을 localStorage에 저장하고 a-1_recommend-result.html로 이동
        ↓
[백엔드: backend/server.js, Render — /api/recommendMicrobe]
  11. 토양/기상 수치를 등급 구간 기반으로 "산성/중성", "낮음/보통/높음" 같은
      영어 정성 서술 질의문으로 변환 (LLM·임베딩 모델은 숫자보다 이런 서술을
      더 잘 이해함)
  12. Voyage AI(voyage-multilingual-2)로 질의문을 임베딩하고, 미리 임베딩해둔
      논문 청크 49,003개(A등급 논문 1,764편) 인덱스에서 코사인 유사도로
      관련 청크 8개를 검색
  13. Gemini(gemini-3.1-flash-lite, 무료 티어)에게 검색된 논문 발췌 + 환경
      데이터(수치 그대로 + 영어 정성 서술)를 주고, 추천 미생물 학명과 함께
      설명을 두 가지로 분리해서 생성하게 함:
      a) explanation — 전문 용어·논문 인용 없이, 이 농경지 상태와 추천
         미생물의 효능을 농민이 바로 이해할 수 있게 쉬운 말로 설명
      b) scientificEvidence — 같은 추천의 학술적 근거를 논문 인용([1],[2]
         등)과 함께 전문적으로 설명 (화면에는 "더보기"로 접어서 노출)
  14. 추천된 학명을 backend/microbe_disclosure.csv(농림축산식품부 미생물
      자재 공시현황 원본: 상표명·사업자·가격·연락처·제조장주소)와 매칭해
      실제 구매 가능한 판매처 목록을 붙임. 학명 표기가 갈리는 경우(흔한
      오타, "A, B" 복수 표기, 균주 표기, Lactobacillus→Lactiplantibacillus·
      Bacillus megaterium→Priestia megaterium 같은 재분류 신학명, "Bacillus
      spp."처럼 속(genus) 단위로만 추천되는 경우 등)에도 매칭되도록 정규화 +
      오타/동의어 표 + 종명(epithet) 단독 매칭 + 같은 속 제품 통합 매칭을 단계적으로 적용
  15. 무료 API 사용량 한도 초과(HTTP 429) 시에는 에러 대신 검색된 논문
      목록만 보여주고 quotaExceeded: true 플래그를 응답에 포함
        ↓
[브라우저: a-1_recommend-result.html]
  16. 추천 미생물 카드(가격대/제품 수/농약·비료 등록 여부/실제 판매처
      목록: 회사명·제품명·가격·연락처) + explanation(쉬운 설명)을 기본으로
      렌더링. scientificEvidence + 참고 논문 목록은 "📄 더보기: 논문 근거로
      살펴보기" 안에 접어서 숨겨두고, 클릭해야 펼쳐짐
```

## 주소 처리

입력창에 도로명 또는 지번 주소를 직접 타이핑하면, 카카오 주소 검색 API가 좌표와 법정동코드를 함께 반환합니다. 이 API는 도로명주소가 없는 농지 지번도 정확히 매칭합니다.

## 사용하는 공공 API

| 데이터 | API | 조회 키 | 비고 |
|---|---|---|---|
| 기온·강수량·일사량·지중온도·지중수분 | 농촌진흥청 국립농업과학원_농업기상 조회일자별 10분 상세 관측데이터 (`getWeatherTenMinList4`) | 관측지점코드(obsr_Spot_Cd) | XML 응답만 지원. 당일 데이터는 약간 지연될 수 있음 |
| 토양 산도·유기물·유효인산·유효규산·전기전도도 (실측값) | 농림수산식품교육문화정보원_팜맵기반 토양검정 조회 서비스 (`getCoordinateBasedSoilAnalsInfo`) | 좌표(EPSG:5179) | 등록된 팜맵 필지 안의 좌표여야 값이 나옴 |
| 토양 산도·유기물·유효인산·칼륨·칼슘·마그네슘·유효규산 (법정동 추정값) | 농촌진흥청 국립농업과학원_농경지화학성 통계정보 V2 (`getFarmExamPhInfo` 등 7개 오퍼레이션) | 법정동코드(10자리) | 등급별 면적(ha) 통계. 위 실측 API가 NODATA일 때만 사용 |
| 농경지 등록 여부(농지/비농지 판별), 판독명(밭/논 등) | 농림수산식품교육문화정보원_팜맵 조회 서비스, 좌표기반 팜맵 상세조회 (`getCoordinateBasedFarmmapInfo`) | 좌표(EPSG:5179) | 위성/항공영상 판독 기준이라 토양검정 기록 유무와 무관하게 농지 자체의 존재 여부를 확인. data.go.kr에서 이 API 상품에 대한 별도 활용신청·승인이 필요 |

## 미생물 추천(RAG + LLM) 인덱스

- 논문 청크/벡터 인덱스(`chunks.jsonl` 167MB, `vectors.f32` 200MB)는 GitHub Release(`paper-index-a-grade-v1`)에 올려두고, 백엔드가 처음 뜰 때 다운로드합니다 (`backend/data/`는 git에 커밋하지 않음).
- 메모리가 적은 Render 무료 인스턴스(512MB 한도)에서도 돌도록 메모리를 최소화했습니다:
  - 청크 본문(167MB)은 메모리에 전부 올리지 않고, 줄 단위 바이트 오프셋(Int32Array 2개)만 들고 있다가 검색 결과 상위 몇 개만 파일에서 그때그때 읽음
  - 벡터(200MB, Float32Array)는 코사인 유사도 전체 스캔이 필요해 메모리에 올리되, 1개만 할당하고 추가 복사는 만들지 않음
  - 검색 시 청크 49,003개 전체를 `{idx,score}` 객체 배열로 만들어 정렬하지 않고, 필요한 상위 k개(8개)만 유지하는 삽입 방식으로 요청당 추가 메모리를 사실상 0에 가깝게 줄임
  - 실측 기준 구동 시 RSS 약 240~260MB (한도 512MB 대비 여유 있음)
- 인덱스를 처음부터 다시 만들 때는 `backend/scripts/buildPaperIndex.js`로 청크 분할 + Voyage 임베딩을 실행합니다.

## 폴더 구조

```
.
├── a_recommend.html         # 주소+작물 입력 화면
├── a-1_recommend-result.html  # 추천 결과 화면 (실제 API 연동)
├── b_spray.html
├── b-1_spray-result.html
├── index.html
├── css/style.css
├── js/
│   ├── app.js                # 결과 화면 렌더링 (a-1은 실제 API, b/b-1은 임시 데이터)
│   ├── regions.js
│   └── agriStations.js       # 자동 생성된 농업기상 관측지점 좌표 목록
└── backend/                  # Render에 배포되는 Express 서버
    ├── server.js
    ├── microbe_disclosure.csv  # 미생물자재 공시현황 원본(실제 판매처/가격/연락처)
    ├── package.json
    ├── render.yaml
    ├── .env.example
    └── scripts/
        ├── buildAgriStations.js  # agriStations.js 재생성 스크립트
        └── buildPaperIndex.js    # 논문 청크 분할 + Voyage 임베딩 인덱스 생성
```

## 배포

- 프론트엔드: GitHub Pages (저장소 루트, 정적 파일)
- 백엔드: Render (Web Service, Root Directory `backend`, Build `npm install`, Start `npm start`)
- 백엔드 환경변수: `PUBLIC_DATA_API_KEY`(공공데이터포털 인증키), `ALLOWED_ORIGINS`(CORS 허용 도메인), `VOYAGE_API_KEY`(Voyage AI 임베딩), `GEMINI_API_KEY`(Gemini 추천 설명 생성, 무료 티어)

## 남은 작업

- 토양 데이터가 "전국 평균값"으로 나오면 그 지역에 실측/통계 데이터가 모두 없다는 뜻 — 사용자에게 안내 필요
- b/b-1(살포 시기) 화면은 아직 임시(가짜) 데이터로만 동작
