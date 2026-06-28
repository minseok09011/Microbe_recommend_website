# TOBio — 농업농촌창업경진대회

토양 성분과 기상 환경에 맞는 미생물을 추천하고, 가지고 있는 농약·미생물제를 언제 뿌려도 안전한지 확인해주는 서비스입니다.

## 🚀 배포 구조 (READ THIS FIRST)

| 구분 | URL | 상태 | 소스 |
|---|---|---|---|
| **현재 라이브 (프론트)** | https://tobio.pages.dev | ✅ 운영 중 | `microbe-ai-landing/` (React + Vite, Cloudflare Pages, `master` 브랜치 push 시 자동 배포) |
| **백엔드** | Render Web Service | ✅ 운영 중 | `backend/server.js` (Express) |
| **DB·인증** | Supabase | ✅ 운영 중 | 로그인 + 내 기록 저장 |
| **BEFORE (구버전)** | https://minseok09011.github.io/Microbe_recommend_website | ⚠️ 레거시·비교용, 현재 404 (Pages 비활성) | 레포 루트 정적 HTML(`index.html`, `a_recommend.html`, `login.html`, `admin.html` 등) |

> ⚠️ **수정은 반드시 `microbe-ai-landing/` 에서 한다.** 루트의 `*.html`/`js/*.js`/`css/style.css`는 BEFORE 데모이며, 현재 라이브(React 앱)에 전혀 반영되지 않는다. React 앱이 더 이상 쓰지 않는 옛 화면이니, 수정 요청을 받으면 먼저 그게 `microbe-ai-landing/` 쪽 얘기인지 확인할 것.

## 현재 구현 범위

도로명/지번 주소(또는 직접 입력한 토양값)와 작물·목적(토양개선/병 방제/해충 방제/일반)을 입력하면,
1. 그 주소가 실제 등록된 농경지인지 먼저 확인하고,
2. 그 농경지의 토양·기상 데이터를 공공 API에서 실시간으로 받아오고,
3. A등급 논문 1,764편 중 관련 근거를 검색해 LLM이 추천 미생물(학명)을 정하고,
4. 농민이 바로 이해할 수 있는 쉬운 설명과 실제 구매 가능한 판매처 정보를 보여줍니다.

추천받은(또는 갖고 있는) 미생물제·농약을 최근에 뿌린 다른 자재와 같이 써도 되는지, 언제부터 뿌려도 안전한지(균종별 최소 간격 + 날씨 적용창)도 계산해줍니다. 로그인하면 추천/살포 확인 기록을 저장해뒀다가 다시 볼 수 있습니다.

## 프론트엔드 — `microbe-ai-landing/` (React + Vite + Tailwind)

react-router 없이 `App.jsx`의 `view` 상태값으로 화면을 전환하는 단일 페이지 앱입니다.

| view | 컴포넌트 | 내용 |
|---|---|---|
| `landing` (기본) | `LandingPage.jsx` | 홈 — 추천/살포확인 시작, 로그인, 내 기록 |
| `crop` | `CropSelect` (`AppFlow.jsx`) | 작물 선택 |
| `purpose` | `PurposeSelect` | 목적 선택(토양개선/병 방제/해충 방제/일반) |
| `address` | `AddressInput` | 주소 입력(카카오 지오코딩) 또는 직접입력 진입 |
| `soilManual` | `ManualSoilInput` | 시설재배 등 토양값 직접 입력 |
| `loading` | `LoadingScreen` | 데이터 수집 + 추천 호출 진행 표시 |
| `result` | `ResultScreen` | 추천 결과 카드 + 판매처 + 논문 근거(접힘) |
| `check` | `CheckScreen` | 최근 뿌린 자재 + 뿌릴 미생물제 입력 |
| `checkResult` | `CheckResultScreen` | 안전 살포일 + 날씨 적용창 결과 |
| `records` | `RecordsScreen` | 로그인한 사용자의 추천/살포확인 기록 목록 |
| `login` | `LoginScreen` | Supabase 이메일/비밀번호 로그인·가입 |

`src/data.js`가 카카오 지오코딩 → 관측지점 매칭 → 백엔드 호출까지 한 흐름으로 묶어놓은 함수들(`fetchRecommend`, `fetchSpraySequence`, `fetchWeatherWindow`, `searchSprayMaterials`, `searchMicrobeProducts`)을 제공합니다.

### 환경변수 (`microbe-ai-landing/.env.example`)

```
VITE_API_BASE_URL=        # 비우면 운영 Render 주소 사용
VITE_KAKAO_REST_KEY=      # 카카오 주소검색 REST 키 (도메인 제한 필수)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Supabase 값이 비어 있으면 로그인/내 기록 기능만 자동으로 꺼지고, 추천·살포 확인 핵심 기능은 그대로 동작합니다.

### 로컬 실행

```
cd microbe-ai-landing
npm install
npm run dev      # vite dev server
npm run build    # 프로덕션 빌드 (Cloudflare Pages가 push 시 동일하게 실행)
```

## 백엔드 — `backend/server.js` (Render, Express)

| 라우트 | 설명 |
|---|---|
| `GET /health` | 헬스체크 + 논문 인덱스 로딩 완료 여부(`paperIndexLoaded`) — 콜드스타트 워밍업 폴링용 |
| `GET /api/getMergedData` | 좌표/법정동코드로 기온·강수량·일사량·지중온도·지중수분(농업기상) + 토양 산도·유기물·인산·칼륨·칼슘·마그네슘(실측→법정동 추정→전국 평균 순) + 농경지 여부(`isFarmland`)를 합쳐서 반환 |
| `GET /api/recommendMicrobe` | 작물·목적·토양·기상값을 받아 RAG+LLM으로 미생물 추천 (아래 참고) |
| `GET /api/searchPapers` | 추천 결과의 "더보기" — 낮은 단계 논문 RAG 검색 |
| `GET /api/sprayMaterials` | 농약/친환경 자재명 자동완성 (`pesticide_risk.csv`, `eco_risk.csv` 기반) |
| `GET /api/microbeProducts` | 미생물제 상품명 자동완성 (`microbe_disclosure.csv` 기반) |
| `POST /api/spraySequence` | 최근 뿌린 자재 목록 + 뿌릴 미생물 균종으로 안전 살포 가능일·주의사항(구리 축적, 고위험 조합 등) 계산 |
| `GET /api/weatherWindow` | 살포 가능일 이후 기상청 단기예보를 보고 세균제/곰팡이제 생육에 적합한 3일 적용창 계산 |

요청 빈도는 IP당 분당 30회로 제한됩니다.

### 미생물 추천(RAG + LLM) 흐름

1. 토양/기상 수치를 등급 구간 기반으로 "산성/중성", "낮음/보통/높음" 같은 영어 정성 서술 질의문으로 변환
2. Voyage AI(`voyage-multilingual-2`)로 질의문을 임베딩하고, 미리 임베딩해둔 논문 청크 49,003개(A등급 논문 1,764편) 인덱스에서 코사인 유사도로 관련 청크 8개를 검색
3. Gemini(`gemini-3.1-flash-lite`, 무료 티어)에게 검색된 논문 발췌 + 환경 데이터를 주고, 추천 미생물 학명과 함께 설명을 두 가지로 분리해서 생성:
   - `explanation` — 전문 용어·논문 인용 없이 쉬운 말로
   - `scientificEvidence` — 논문 인용([1],[2] 등)과 함께 학술적으로 (화면엔 "더보기"로 접어둠)
4. 추천된 학명을 `backend/microbe_disclosure.csv`(농림축산식품부 미생물자재 공시현황 원본)와 매칭해 실제 구매 가능한 판매처(회사명·제품명·가격·연락처)를 붙임 — 오타/동의어, 학명 재분류(예: *Lactobacillus*→*Lactiplantibacillus*), 속(genus) 단위 추천 등도 단계적으로 매칭
5. 무료 API 한도 초과(HTTP 429) 시 에러 대신 검색된 논문 목록만 보여주고 `quotaExceeded: true` 플래그 반환

논문 청크/벡터 인덱스(`chunks.jsonl` 167MB, `vectors.f32` 200MB)는 GitHub Release(`paper-index-a-grade-v1`)에 올려두고 백엔드가 처음 뜰 때 다운로드합니다(`backend/data/`는 git에 커밋하지 않음). Render 무료 인스턴스(512MB 한도)에서도 돌도록 청크 본문은 메모리에 올리지 않고 바이트 오프셋만 들고 있다가 필요한 것만 읽고, 검색 시 상위 k개만 유지하는 방식으로 메모리를 최소화했습니다(실측 RSS 약 240~260MB). 인덱스를 처음부터 다시 만들 때는 `backend/scripts/buildPaperIndex.js`로 청크 분할 + Voyage 임베딩을 실행합니다.

### 사용하는 공공 API

| 데이터 | API | 조회 키 | 비고 |
|---|---|---|---|
| 기온·강수량·일사량·지중온도·지중수분 | 농촌진흥청 국립농업과학원_농업기상 조회일자별 10분 상세 관측데이터 (`getWeatherTenMinList4`) | 관측지점코드(obsr_Spot_Cd) | XML 응답만 지원. 당일 데이터는 약간 지연될 수 있음 |
| 토양 산도·유기물·유효인산·유효규산·전기전도도 (실측값) | 농림수산식품교육문화정보원_팜맵기반 토양검정 조회 서비스 (`getCoordinateBasedSoilAnalsInfo`) | 좌표(EPSG:5179) | 등록된 팜맵 필지 안의 좌표여야 값이 나옴 |
| 토양 산도·유기물·유효인산·칼륨·칼슘·마그네슘·유효규산 (법정동 추정값) | 농촌진흥청 국립농업과학원_농경지화학성 통계정보 V2 (`getFarmExamPhInfo` 등 7개 오퍼레이션) | 법정동코드(10자리) | 등급별 면적(ha) 통계. 실측 API가 NODATA일 때만 사용 |
| 농경지 등록 여부(농지/비농지 판별), 판독명(밭/논 등) | 농림수산식품교육문화정보원_팜맵 조회 서비스, 좌표기반 팜맵 상세조회 (`getCoordinateBasedFarmmapInfo`) | 좌표(EPSG:5179) | 위성/항공영상 판독 기준. data.go.kr에서 이 API 상품에 대한 별도 활용신청·승인 필요 |
| 살포 적용창 단기예보 | 기상청 단기예보(동네예보) | 격자(nx,ny) | `KMA_API_KEY` 필요 |

### 환경변수 (`backend/.env.example`)

```
PUBLIC_DATA_API_KEY=   # 공공데이터포털 인증키
ALLOWED_ORIGINS=       # CORS 허용 도메인(프론트 주소)
PORT=3000              # Render는 자체 PORT를 주입
VOYAGE_API_KEY=        # Voyage AI 임베딩
GEMINI_API_KEY=        # Gemini 추천 설명 생성(무료 티어)
KMA_API_KEY=           # 기상청 단기예보(살포 적용창)
```

Render 설정: Root Directory `backend`, Build `npm install`, Start `npm start`.

## Supabase — 로그인 + 내 기록

- **인증**: 이메일/비밀번호. `microbe-ai-landing/src/supabaseClient.js`가 클라이언트를 만들고, `records.js`가 `signUp`/`signIn`/`signOut`/`resetPassword`/`onAuthChange`를 제공. 환경변수가 비어 있으면 `supabaseEnabled=false`로 관련 기능이 통째로 꺼짐.
- **테이블**
  - `farmers`: 사용자 프로필 (id=auth.uid, username, name, phone, region, role: `admin`|`farmer`)
  - `records`: 저장된 추천/살포확인 결과 (id, user_id, kind: `recommend`|`spray`, title, crop, summary, payload(전체 결과 JSON), created_at) — RLS로 본인 것만 조회/수정, admin은 전체 조회
- **Edge Functions** (`supabase/functions/`)
  - `create-farmer` — 관리자가 농가 계정을 생성(JWT + admin 권한 검증 후 `auth.admin.createUser` + `farmers` insert)
  - `check-email-exists` — 비밀번호 재설정 흐름에서 이메일 존재 여부 확인(anon 키로는 직접 조회 불가하기 때문)
- 자세한 설정 절차는 `SUPABASE_SETUP.md` 참고.

## 폴더 구조

```
.
├── microbe-ai-landing/        # ★ 실제 라이브 프론트 (React+Vite, Cloudflare Pages)
│   ├── src/
│   │   ├── App.jsx              # view 상태 기반 화면 전환
│   │   ├── LandingPage.jsx
│   │   ├── AppFlow.jsx          # CropSelect~CheckResultScreen
│   │   ├── LoginScreen.jsx
│   │   ├── RecordsScreen.jsx
│   │   ├── data.js              # 작물 목록 + 백엔드 호출 orchestration
│   │   ├── agriStations.js      # 농업기상 관측지점 215개 좌표
│   │   ├── records.js           # Supabase 인증/기록 CRUD
│   │   └── supabaseClient.js
│   ├── public/img/              # 토비오 마스코트 이미지 등
│   └── .env.example
│
├── backend/                    # Render에 배포되는 Express 서버
│   ├── server.js                # API 라우트 전체
│   ├── weather_forecast.js      # 기상청 단기예보(살포 적용창)
│   ├── spray_sequence.js        # 살포 안전일 계산 엔진
│   ├── application_window.js    # 적용창(생육 적합일) 계산
│   ├── microbe_disclosure.csv   # 미생물자재 공시현황 원본(판매처/가격/연락처)
│   ├── pesticide_risk.csv       # 농약 위험표
│   ├── eco_risk.csv             # 친환경 자재 위험표
│   ├── render.yaml
│   ├── .env.example
│   └── scripts/
│       ├── buildAgriStations.js   # agriStations.js 재생성
│       └── buildPaperIndex.js     # 논문 청크 분할 + Voyage 임베딩 인덱스 생성
│
├── supabase/functions/         # Supabase Edge Functions (create-farmer, check-email-exists)
├── SUPABASE_SETUP.md
│
└── (레거시·비라이브) index.html, a_recommend.html, a-1_recommend-result.html,
    b_spray.html, b-1_spray-result.html, login.html, dashboard.html, admin.html,
    diagnose.html, records.html, record-form.html, css/style.css, js/*.js
    — 초기 정적 데모. React 앱(microbe-ai-landing)이 모든 기능을 대체했고
    이 파일들은 더 이상 배포되지 않음. 수정하지 말 것.
```

## 남은 작업

- 토양 데이터가 "전국 평균값"으로 나오면 그 지역에 실측/통계 데이터가 모두 없다는 뜻 — 화면에 출처 안내는 되어 있으나 추가 안내 여지 있음
- 레거시 루트 정적 파일들 정리(삭제 또는 archive 분리) 필요
