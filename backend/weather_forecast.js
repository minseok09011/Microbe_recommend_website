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

// 좌표 단위 stale cache — 정상 응답을 격자별로 별도 보관해서, KMA가 일시 장애일 때
// 만료된 예보라도 반환 (no data보다 stale data가 UX상 훨씬 나음).
// TTL: 24h (그 이상 지난 예보는 의미 없음).
const _staleCache = new Map();
const STALE_TTL_MS = 24 * 3600 * 1000;

// ── Open-Meteo 백업 API (무료/무인증) ─────────────────────────────────────
// KMA가 완전 다운(전체 좌표 502/429)되고 stale cache도 비었을 때 최종 폴백.
// 한국 기상청보다 정밀도는 낮지만 살포일 판정(강수/기온/구름)엔 충분.
// 응답을 KMA aggregate 형식({date, tmn, tmx, maxPop, sumPcpMm, maxPcpMm,
// anyHeavyRain, avgReh, skyWorst, maxWsd, hourly})으로 변환해 bestApplyDay()가
// 그대로 사용할 수 있게 한다.
const OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast";

async function fetchOpenMeteoForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "temperature_2m,precipitation,precipitation_probability,relative_humidity_2m,cloud_cover",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    timezone: "Asia/Seoul",
    forecast_days: "4",
  });
  const res = await fetch(`${OPENMETEO_URL}?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return res.json();
}

function _openMeteoToKmaFormat(json) {
  const daily = json.daily || {};
  const hourly = json.hourly || {};
  const dailyTimes = daily.time || []; // ["2026-06-30", ...]
  const hourlyTimes = hourly.time || []; // ["2026-06-30T00:00", ...]

  // hourly 인덱스를 일자별로 그룹핑
  const hourlyByDay = new Map();
  hourlyTimes.forEach((t, i) => {
    const day = String(t).slice(0, 10);
    if (!hourlyByDay.has(day)) hourlyByDay.set(day, []);
    hourlyByDay.get(day).push(i);
  });

  const days = [];
  for (let di = 0; di < dailyTimes.length; di++) {
    const iso = dailyTimes[di]; // "2026-06-30"
    const yyyymmdd = iso.replace(/-/g, "");
    const indices = hourlyByDay.get(iso) || [];

    const pcps = indices.map((i) => hourly.precipitation?.[i]).filter((v) => Number.isFinite(v));
    const rehs = indices.map((i) => hourly.relative_humidity_2m?.[i]).filter((v) => Number.isFinite(v));
    const clouds = indices.map((i) => hourly.cloud_cover?.[i]).filter((v) => Number.isFinite(v));

    const maxPcpMm = pcps.length ? Math.max(...pcps) : 0;
    const sumPcpMm = pcps.reduce((a, b) => a + b, 0);
    const avgReh = rehs.length ? Math.round(rehs.reduce((a, b) => a + b, 0) / rehs.length) : null;
    // 구름량(%) 평균 → KMA SKY 코드(1맑음 / 3구름많음 / 4흐림)에 근사 매핑
    let skyWorst = null;
    if (clouds.length) {
      const avgCloud = clouds.reduce((a, b) => a + b, 0) / clouds.length;
      skyWorst = avgCloud < 30 ? 1 : avgCloud < 70 ? 3 : 4;
    }

    // KMA hourly 호환 형식 — TMP/POP/PCP만 (PTY는 Open-Meteo에 직접 매칭 어려워 생략)
    const hourlyOut = [];
    for (const i of indices) {
      const time = String(hourlyTimes[i] || "").slice(11, 16).replace(":", "");
      const tmp = hourly.temperature_2m?.[i];
      const pop = hourly.precipitation_probability?.[i];
      const pcp = hourly.precipitation?.[i];
      if (Number.isFinite(tmp)) hourlyOut.push({ time, category: "TMP", value: String(tmp) });
      if (Number.isFinite(pop)) hourlyOut.push({ time, category: "POP", value: String(pop) });
      if (Number.isFinite(pcp) && pcp > 0) hourlyOut.push({ time, category: "PCP", value: String(pcp) });
    }

    days.push({
      date: yyyymmdd,
      tmn: daily.temperature_2m_min?.[di] ?? null,
      tmx: daily.temperature_2m_max?.[di] ?? null,
      maxPop: daily.precipitation_probability_max?.[di] ?? 0,
      sumPcpMm,
      maxPcpMm,
      anyHeavyRain: maxPcpMm >= 5,
      avgReh,
      skyWorst,
      maxWsd: daily.wind_speed_10m_max?.[di] ?? null,
      hourly: hourlyOut,
    });
  }
  return days;
}

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
//    실패 시: 429/5xx는 짧은 backoff로 1~2회 재시도. 그래도 실패하면 좌표별 stale cache가
//    있으면 만료된 예보라도 반환(부분 정확도 < 완전 실패). 둘 다 안 되면 에러.
async function fetchVilageForecast(lat, lon, now = new Date()) {
  const KMA_API_KEY = process.env.KMA_API_KEY;
  if (!KMA_API_KEY) throw new Error("KMA_API_KEY가 설정되지 않았습니다(.env).");

  const { nx, ny } = latLonToGrid(lat, lon);
  const { base_date, base_time } = latestBaseDateTime(now);

  const cacheKey = `${nx},${ny},${base_date},${base_time}`;
  const cached = _forecastCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const staleKey = `${nx},${ny}`;
  const url =
    `${KMA_BASE_URL}?serviceKey=${encodeServiceKey(KMA_API_KEY)}` +
    `&pageNo=1&numOfRows=1000&dataType=JSON` +
    `&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;

  let lastErr = null;
  // 1회 호출 + 최대 2회 재시도 (총 3회 시도) — 429/5xx는 KMA 측 일시 hiccup이 흔함
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < 2) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        throw new Error(`기상청 API HTTP ${res.status}`);
      }
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
      _staleCache.set(staleKey, { data: days, savedAt: Date.now() });
      return days;
    } catch (err) {
      lastErr = err;
      // AbortError나 네트워크 오류도 재시도
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
    }
  }

  // 모든 시도 실패 — 같은 격자의 stale cache가 24h 안에 있으면 그거라도 반환
  const stale = _staleCache.get(staleKey);
  if (stale && Date.now() - stale.savedAt < STALE_TTL_MS) {
    console.warn(`⚠️ KMA 일시 실패 → stale cache 반환 (nx=${nx},ny=${ny}, 저장 ${Math.round((Date.now() - stale.savedAt) / 60000)}분 전)`);
    return stale.data;
  }

  // stale cache도 없으면 Open-Meteo 백업 호출 — KMA 완전 다운 상황에서도 살포일 판정 유지
  try {
    console.warn(`⚠️ KMA 완전 실패 + stale 없음 → Open-Meteo 백업 호출 (lat=${lat},lon=${lon})`);
    const ometJson = await fetchOpenMeteoForecast(lat, lon);
    const days = _openMeteoToKmaFormat(ometJson);
    if (!Array.isArray(days) || days.length === 0) throw new Error("Open-Meteo 응답 비어 있음");
    // Open-Meteo 응답도 stale cache에 넣어둠 — 다음 KMA 실패 시 즉시 사용
    _staleCache.set(staleKey, { data: days, savedAt: Date.now() });
    return days;
  } catch (omErr) {
    console.error("❌ Open-Meteo 백업도 실패:", omErr.message);
  }

  throw lastErr || new Error("기상청 API 호출 실패");
}

module.exports = { latLonToGrid, latestBaseDateTime, parsePcpMm, fetchVilageForecast };
