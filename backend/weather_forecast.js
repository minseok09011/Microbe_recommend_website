/* ============================================================
   기상청 단기예보(getVilageFcst) 모듈 — 미생물 "적용 타이밍" 전용.
   ⚠️ 종 선택·화학 살포간격(spray_sequence.js)에는 일절 관여하지 않는다. 날짜 계산만.

   - 인증키: process.env.KMA_API_KEY (.env). 하드코딩/커밋 금지.
   - 좌표는 위경도가 아니라 격자(nx,ny) → dfs_xy_conv 표준 변환식.
   - 발표시각(base_time): 02·05·08·11·14·17·20·23시, 발표 후 ~45분 버퍼.
   - PCP(강수량)는 숫자가 아니라 문자열("강수없음","1mm 미만","30.0~50.0mm" 등) → 파싱 분기.
   ============================================================ */

const KMA_BASE_URL =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

// 1) 위경도 → 기상청 격자 (dfs_xy_conv 표준 이식)
function latLonToGrid(lat, lon) {
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0; // 표준위도 1
  const SLAT2 = 60.0; // 표준위도 2
  const OLON = 126.0; // 기준점 경도
  const OLAT = 38.0; // 기준점 위도
  const XO = 43; // 기준점 X좌표
  const YO = 136; // 기준점 Y좌표
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

// 2) 현재 시각 → 가장 최근 발표 base_date/base_time (KST 기준, 45분 버퍼)
//    Render는 UTC로 도므로 now(실제 instant)를 KST 벽시계로 변환해 계산한다.
function latestBaseDateTime(now = new Date()) {
  // UTC instant → KST 벽시계: +9h 후 getUTC* 로 읽는다.
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const cur = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  const slots = [2, 5, 8, 11, 14, 17, 20, 23];
  let chosen = null;
  for (let i = slots.length - 1; i >= 0; i--) {
    if (cur >= slots[i] * 60 + 45) {
      chosen = slots[i];
      break;
    }
  }

  let baseMs = Date.UTC(y, m, d);
  if (chosen === null) {
    // 02:45 이전 → 전날 2300 발표분 사용
    baseMs -= 24 * 3600 * 1000;
    chosen = 23;
  }
  const base = new Date(baseMs);
  const pad = (n) => String(n).padStart(2, "0");
  const base_date = `${base.getUTCFullYear()}${pad(base.getUTCMonth() + 1)}${pad(base.getUTCDate())}`;
  const base_time = `${pad(chosen)}00`;
  return { base_date, base_time };
}

// 3) PCP/강수 문자열 → 대략 mm 숫자 (washout 판정용). 파싱 실패는 보수적으로 큰 값.
function parsePcpMm(str) {
  if (str == null) return 999;
  const s = String(str).trim();
  if (s === "" || s === "-" || s === "강수없음" || s === "없음" || s === "0") return 0;
  // "1.0mm 미만", "1mm 미만" → 절반으로 추정(소량)
  if (s.includes("미만")) {
    const m = s.match(/([\d.]+)/);
    return m ? Math.max(0, parseFloat(m[1]) * 0.5) : 0.5;
  }
  // "30.0~50.0mm" → 상한값(보수적)
  const range = s.match(/([\d.]+)\s*~\s*([\d.]+)/);
  if (range) return parseFloat(range[2]);
  // "50.0mm 이상", "1.0mm" 등 → 첫 숫자
  const m = s.match(/([\d.]+)/);
  if (m) return parseFloat(m[1]);
  return 999; // 알 수 없는 표기 → 보수적 큰 값(부적합으로 처리되게)
}

// KMA 서비스키 인코딩: 이미 URL 인코딩된 키(%XX 포함)면 그대로, 아니면 encodeURIComponent.
function encodeServiceKey(key) {
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

// 발표분 단위 in-memory 캐시(키: nx,ny,base_date,base_time / TTL 3h) — Render 호출 절약
const _forecastCache = new Map();
const CACHE_TTL_MS = 3 * 3600 * 1000;

function _aggregateDaily(items) {
  // fcstDate별로 카테고리를 모은다.
  const byDate = new Map();
  for (const it of items) {
    const date = it.fcstDate;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(it);
  }

  const days = [];
  for (const [date, list] of byDate.entries()) {
    const get = (cat) => list.filter((x) => x.category === cat);
    const nums = (cat) =>
      get(cat)
        .map((x) => parseFloat(x.fcstValue))
        .filter((v) => Number.isFinite(v));

    const tmps = nums("TMP");
    const tmnArr = nums("TMN");
    const tmxArr = nums("TMX");
    const pops = nums("POP");
    const rehs = nums("REH");
    const skys = nums("SKY");
    const wsds = nums("WSD");
    const ptys = nums("PTY");
    const pcpMms = get("PCP").map((x) => parsePcpMm(x.fcstValue));

    const tmn = tmnArr.length ? Math.min(...tmnArr) : tmps.length ? Math.min(...tmps) : null;
    const tmx = tmxArr.length ? Math.max(...tmxArr) : tmps.length ? Math.max(...tmps) : null;
    const maxPop = pops.length ? Math.max(...pops) : 0;
    const sumPcpMm = pcpMms.reduce((a, b) => a + b, 0);
    const maxPcpMm = pcpMms.length ? Math.max(...pcpMms) : 0;
    const avgReh = rehs.length ? Math.round(rehs.reduce((a, b) => a + b, 0) / rehs.length) : null;
    const skyWorst = skys.length ? Math.max(...skys) : null; // 1맑음 < 3구름많음 < 4흐림
    const maxWsd = wsds.length ? Math.max(...wsds) : null;
    // 폭우 신호: 비/비눈/소나기(PTY 1·2·4) 중 시간당 강수 강함, 또는 강수확률 매우 높음
    const anyHeavyRain = maxPcpMm >= 5 || (ptys.some((p) => p === 1 || p === 2 || p === 4) && maxPcpMm >= 5);

    const hourly = list
      .filter((x) => x.category === "TMP" || x.category === "POP" || x.category === "PTY" || x.category === "PCP")
      .map((x) => ({ time: x.fcstTime, category: x.category, value: x.fcstValue }));

    days.push({ date, tmn, tmx, maxPop, sumPcpMm, maxPcpMm, anyHeavyRain, avgReh, skyWorst, maxWsd, hourly });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

// 4) 예보 호출 → fcstDate별 일 단위 집계 배열 (오늘~글피)
async function fetchVilageForecast(lat, lon, now = new Date()) {
  const KMA_API_KEY = process.env.KMA_API_KEY;
  if (!KMA_API_KEY) throw new Error("KMA_API_KEY가 설정되지 않았습니다(.env).");

  const { nx, ny } = latLonToGrid(lat, lon);
  const { base_date, base_time } = latestBaseDateTime(now);

  const cacheKey = `${nx},${ny},${base_date},${base_time}`;
  const cached = _forecastCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const url =
    `${KMA_BASE_URL}?serviceKey=${encodeServiceKey(KMA_API_KEY)}` +
    `&pageNo=1&numOfRows=1000&dataType=JSON` +
    `&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`기상청 API HTTP ${res.status}`);
  const json = await res.json();

  const resultCode = json?.response?.header?.resultCode;
  if (resultCode !== "00") {
    const msg = json?.response?.header?.resultMsg || "알 수 없음";
    throw new Error(`기상청 API 오류 (resultCode=${resultCode}, ${msg})`);
  }

  const items = json?.response?.body?.items?.item;
  if (!Array.isArray(items) || items.length === 0) throw new Error("예보 데이터가 비어 있습니다.");

  const days = _aggregateDaily(items);
  _forecastCache.set(cacheKey, { data: days, expires: Date.now() + CACHE_TTL_MS });
  return days;
}

module.exports = { latLonToGrid, latestBaseDateTime, parsePcpMm, fetchVilageForecast };
