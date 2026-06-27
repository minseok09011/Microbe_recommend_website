/**
 * 살포 시퀀스 계산 엔진
 * 핵심 원칙:
 *   1) 여러 자재를 쳐도 텀은 "합"이 아니라 "가장 늦게 풀리는 날"(max)
 *   2) 세균제/곰팡이제는 따로 집계 (한 숫자로 못 합침)
 *   3) 구리·금속은 분해가 아니라 누적 → 별도 경고
 *   4) 텀은 "최소 N일 이상, 길수록 안전" (단정 금지)
 *
 * 위험표(상표명_위험조회 / 친환경 / 비료 / 소독제)에서 조회한 값을 input으로 받는다.
 */

// 위험등급 → 기본 텀(일). "최소 권장 간격"이며 보장값 아님.
const TERM_DAYS = { "🔴": 14, "🟡": 7, "🟢": 0 };
const RISK_RANK = { "🔴": 3, "🟡": 2, "🟢": 1 };

// 비료·소독제는 제품DB가 없어 종류룰(상수). 종류 버튼 value → {세균,곰팡이,계열}
const TYPE_RULES = {
  // 비료
  "fert_nitrogen":   { b: "🟡", f: "🟡", family: "질소·칼리·복합비료" },
  "fert_lime":       { b: "🟡", f: "🟡", family: "석회·규산·고토" },
  "fert_rawmanure":  { b: "🟡", f: "🟡", family: "미부숙 가축분" },
  "fert_compost":    { b: "🟢", f: "🟢", family: "완숙퇴비·유기질·미생물" },
  "fert_nutrient":   { b: "🟢", f: "🟢", family: "영양제·미량요소" },
  "fert_cyanamide":  { b: "🔴", f: "🔴", family: "석회질소(예외)" },
  // 소독제
  "disinf_oxidizer": { b: "🔴", f: "🔴", family: "산화제계(과산화수소·과산화초산)" },
  "disinf_chlorine": { b: "🔴", f: "🔴", family: "염소계(차아염소산·이산화염소)" },
  // 미생물 약제(직전에 다른 미생물제) — 동종이라 안전
  "microbe":         { b: "🟢", f: "🟢", family: "미생물 약제" },
  "none":            { b: "🟢", f: "🟢", family: "없음" }
};

/**
 * 자재 1건 입력 형태:
 * {
 *   name: "코사이드",            // 상표명/종류
 *   appliedDate: "2026-06-20",   // 살포일 (YYYY-MM-DD)
 *   bacteriaRisk: "🔴",          // 세균제용 위험 (표에서 조회)
 *   fungusRisk:   "🔴",          // 곰팡이제용 위험 (표에서 조회)
 *   family: "동제(구리)",        // 계열 (구리 누적 판정용)
 *   source: "PMC10568630"        // 근거링크(선택)
 * }
 *
 * inoculantType: "bacteria" | "fungus"   // 농민이 칠 미생물제 종류
 * inoculantDate: "2026-06-27"            // 미생물제 살포 예정일(선택, 없으면 오늘)
 */

/**
 * 기온 정성 문구 — 현재 기온(관측값) 1개로 분기.
 * 원칙: 텀 숫자를 바꾸지 않는다. 문구로만 "더 여유 두라"고 안내(안전 방향).
 *       🟢(안전)엔 문구 불필요. 데이터 없으면(null) 문구 생략.
 * @param tempC 현재 기온(℃) | null
 * @param maxRisk 이번 판정의 최고 위험등급 "🔴"|"🟡"|"🟢"
 */
function tempAdvisory(tempC, maxRisk) {
  if (tempC == null || maxRisk === "🟢") return null;   // 안전이거나 데이터 없으면 생략
  if (tempC >= 25)
    return "기온이 높아(≥25℃) 미생물 활동·회복이 빠른 편입니다. 권장 간격을 지키되 기본대로 진행하세요.";
  if (tempC >= 15)
    return null;  // 평년(15~25℃) — 추가 문구 없음
  if (tempC >= 5)
    return "기온이 낮아(5~15℃) 미생물 회복이 느립니다. 권장 간격보다 며칠 더 여유를 두세요.";
  return "저온기(<5℃)에는 미생물 정착이 크게 지연됩니다. 가능하면 따뜻해진 뒤 살포하거나 충분히 여유를 두세요.";
}

function daysBetween(d1, d2) {
  const ms = new Date(d2) - new Date(d1);
  return Math.round(ms / 86400000);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function calcSpraySequence(materials, inoculantType, inoculantDate, currentTempC) {
  const today = new Date().toISOString().slice(0, 10);
  inoculantDate = inoculantDate || today;
  currentTempC = currentTempC == null ? null : currentTempC;   // 관측 기온(없으면 null)
  // inoculantType: "bacteria" | "fungus" | "both"(균종 모름 → 보수적: 둘 중 위험한 쪽)
  const pickRisk = (m) => {
    if (inoculantType === "bacteria") return m.bacteriaRisk;
    if (inoculantType === "fungus") return m.fungusRisk;
    // both: 더 위험한(랭크 높은) 쪽 채택
    return RISK_RANK[m.fungusRisk] >= RISK_RANK[m.bacteriaRisk] ? m.fungusRisk : m.bacteriaRisk;
  };

  // 1) 각 자재의 "해제일" = 살포일 + 텀.  (합 아님 — 자재마다 독립적으로 시계가 돈다)
  const evaluated = materials.map(m => {
    const risk = pickRisk(m);
    const term = TERM_DAYS[risk];
    const clearDate = addDays(m.appliedDate, term);   // 이 자재 기준 안전 살포일
    return { ...m, risk, term, clearDate };
  });

  // 2) 안전 살포 가능일 = 모든 해제일 중 "가장 늦은 날" (MAX, 절대 SUM 아님)
  const governing = evaluated.reduce(
    (latest, e) => (e.clearDate > latest.clearDate ? e : latest),
    evaluated[0]
  );
  const safeDate = governing.clearDate;

  // 3) 구리/금속 누적 경고 (분해가 아니라 쌓임 — 텀과 별개)
  const copperHits = evaluated.filter(e => /구리|동제|보르도|석회유황/.test(e.family || ""));
  const copperFlag = copperHits.length >= 3
    ? {
        flag: true,
        count: copperHits.length,
        message: `구리·황 계열을 이번 시즌 ${copperHits.length}회 살포했습니다. 구리는 분해되지 않고 토양에 누적되므로, 권장 간격을 지켜도 잔류가 쌓입니다. 살포 횟수를 줄이거나 충분히 여유를 두세요.`
      }
    : { flag: false };

  // 4) 미생물제 예정일이 안전일보다 이른지 판정
  const gap = daysBetween(inoculantDate, safeDate); // 양수면 아직 더 기다려야 함
  let verdict, headline;
  if (gap <= 0) {
    verdict = "safe";
    headline = `${inoculantDate} 살포 가능 — 권장 간격을 충족합니다.`;
  } else {
    verdict = "wait";
    headline = `아직 이릅니다. ${safeDate} 이후(약 ${gap}일 더) 살포를 권장합니다. 길수록 안전합니다.`;
  }

  // 5) 기온 정성 문구 (텀 불변 — 문구만)
  const maxRisk = evaluated.reduce((mx, e) => (RISK_RANK[e.risk] > RISK_RANK[mx] ? e.risk : mx), "🟢");
  const tempNote = tempAdvisory(currentTempC, maxRisk);

  return {
    verdict,                       // "safe" | "wait"
    headline,                      // 사용자 표시 문구
    safeDate,                      // 가장 늦게 풀리는 날 = 권장 살포 가능일
    tempAdvisory: tempNote,        // 기온 기반 정성 안내 (null 가능)
    governingMaterial: {           // 이 날짜를 결정한(가장 발목 잡는) 자재
      name: governing.name,
      family: governing.family,
      risk: governing.risk,
      term: governing.term,
      appliedDate: governing.appliedDate,
      source: governing.source || null
    },
    perMaterial: evaluated.map(e => ({  // 자재별 내역 (투명성)
      name: e.name, family: e.family, risk: e.risk,
      term: e.term, appliedDate: e.appliedDate, clearDate: e.clearDate
    })),
    copperWarning: copperFlag,
    note: "표시된 간격은 '최소 권장값'이며 밭 조건(저온·건조·척박)에 따라 더 길어질 수 있습니다."
  };
}

/* ───────────────────── 예시 (직접 실행 시에만: node spray_sequence.js) ───────────────────── */
if (require.main === module) {
  // 농민이 6/18 구리, 6/22 트리아졸을 쳤고, 6/27에 곰팡이제(트리코더마) 접종 예정
  const example = calcSpraySequence(
    [
      { name: "코사이드",   appliedDate: "2026-06-18", bacteriaRisk: "🔴", fungusRisk: "🔴", family: "동제(구리)", source: "PMC10568630" },
      { name: "오티바",     appliedDate: "2026-06-22", bacteriaRisk: "🟢", fungusRisk: "🔴", family: "스트로빌루린(QoI)", source: "PMC4286127" },
      { name: "다트롤",     appliedDate: "2026-06-22", bacteriaRisk: "🟢", fungusRisk: "🟢", family: "살충제(비표적)" }
    ],
    "fungus",          // 곰팡이제(트리코더마) 접종
    "2026-06-27",
    11                 // 현재 기온 11℃ (저온 → 문구 발동)
  );
  console.log(JSON.stringify(example, null, 2));
}

// 결과 핵심:
//   - 코사이드 해제일 6/18+14 = 7/2
//   - 오티바  해제일 6/22+14 = 7/6   ← 가장 늦음 = governing
//   - 다트롤  해제일 6/22+0  = 6/22
//   → safeDate = 7/6 (합 28일+가 아니라 MAX)
//   → 6/27 예정은 이르므로 "7/6 이후, 약 9일 더" 권장

module.exports = { calcSpraySequence, TERM_DAYS };
