/* ============================================================
   TOBio 백엔드 연동 레이어
   백엔드: https://microbe-recommend-website.onrender.com (Render)

   추천 실제 흐름:
     1) 주소 → 카카오 지오코딩으로 위경도 + 법정동코드(b_code)
     2) 위경도 → 농업기상 관측소(215개) 중 최근접 stationId
     3) GET /api/getMergedData  → 토양·기상·농지여부(isFarmland)
     4) isFarmland === false 면 추천 차단
     5) GET /api/recommendMicrobe → 추천 미생물 + 판매처 + 논문 근거

   살포 확인 실제 흐름:
     - GET  /api/sprayMaterials  (자재 자동완성)
     - POST /api/spraySequence   (이전 살포 자재 + 날짜 → 안전 살포일)
   ============================================================ */

// Vite 환경변수로 덮어쓸 수 있게(.env: VITE_API_BASE_URL=...). 비면 운영 백엔드 사용.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://microbe-recommend-website.onrender.com";

// 카카오 REST 키 (기존 a_recommend.html에서 쓰던 키). .env의 VITE_KAKAO_REST_KEY로 교체 권장.
// ⚠️ 클라이언트에 노출되는 키이므로 카카오 콘솔에서 도메인(깃허브 페이지 주소) 제한 필수.
const KAKAO_REST_API_KEY =
  import.meta.env.VITE_KAKAO_REST_KEY || "715a0e6e29aab1838d771a4a0a775ae9";

export const CROPS = [
  { id: "tomato", icon: "🍅", name: "토마토" },
  { id: "pepper", icon: "🌶️", name: "고추" },
  { id: "rice", icon: "🌾", name: "벼" },
  { id: "cabbage", icon: "🥬", name: "배추" },
  { id: "potato", icon: "🥔", name: "감자" },
  { id: "soybean", icon: "🥜", name: "대두" },
  { id: "corn", icon: "🌽", name: "옥수수" },
  { id: "wheat", icon: "🌿", name: "밀" },
  { id: "lettuce", icon: "🥗", name: "상추" },
  { id: "garlic", icon: "🧄", name: "마늘" },
  { id: "onion", icon: "🧅", name: "양파" },
  { id: "apple", icon: "🍎", name: "사과" },
];

export const LOAD_STEPS = [
  { id: "ls0", icon: "📍", label: "농경지 위치 확인 중...", doneLabel: "농경지 위치 확인 완료" },
  { id: "ls1", icon: "🌤️", label: "기상·토양 데이터 수집 중...", doneLabel: "기상·토양 데이터 수집 완료" },
  { id: "ls2", icon: "📚", label: "관련 논문 검색 중...", doneLabel: "논문 검색 완료" },
  { id: "ls3", icon: "🤖", label: "AI 미생물 추천 생성 중...", doneLabel: "AI 추천 완료" },
];

export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 카카오 지오코딩 ───────────────────────────────────────── */
// 카카오 주소검색 응답 1건을 프론트 표준 형태로 변환
function mapKakaoDoc(doc) {
  const addr = doc.address || null;
  const road = doc.road_address || null;
  return {
    address: doc.address_name || (addr && addr.address_name) || (road && road.address_name) || "",
    roadAddr: road ? road.address_name : "",
    jibunAddr: addr ? addr.address_name : "",
    detail: (addr && addr.region_3depth_name) || (road && road.region_3depth_name) || "",
    lat: parseFloat(doc.y),
    lng: parseFloat(doc.x),
    stdgCd: addr ? addr.b_code : "", // 법정동코드 (지역 토양 추정에 사용)
  };
}

async function kakaoGeocode(query) {
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`,
    {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) throw new Error(`카카오 주소검색 오류 (HTTP ${res.status})`);
  const json = await res.json();
  if (!Array.isArray(json.documents)) throw new Error(json.message || "카카오 주소검색 응답 오류");
  return json.documents.map(mapKakaoDoc);
}

// AddressInput 자동완성용 — 실패하면 빈 배열(입력 주소로 진행 폴백)
export async function searchAddress(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    return await kakaoGeocode(query.trim());
  } catch (e) {
    console.warn("[TOBio] 주소 검색 실패:", e.message);
    return [];
  }
}

/* ── 관측소 매칭 (하버사인) ────────────────────────────────── */
import { AGRI_STATIONS } from "./agriStations.js";

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestStation(lat, lng) {
  let best = AGRI_STATIONS[0];
  let min = Infinity;
  for (const s of AGRI_STATIONS) {
    const d = distKm(lat, lng, s.lat, s.lng);
    if (d < min) {
      min = d;
      best = s;
    }
  }
  return best;
}

/* ── 추천 파이프라인 ──────────────────────────────────────── */
function nowDateTime() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return {
    dateStr: `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}`,
    timeStr: `${p(n.getHours())}00`,
  };
}

export async function fetchRecommend(crop, address) {
  try {
    // 1) 좌표/법정동코드 확보 (자동완성에서 고른 주소는 이미 있음, 아니면 지오코딩)
    let lat = address?.lat;
    let lng = address?.lng;
    let stdgCd = address?.stdgCd || "";
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const text = address?.address || address?.roadAddr || address?.jibunAddr || "";
      if (!text) throw new Error("주소 정보가 없습니다.");
      const hits = await kakaoGeocode(text);
      if (!hits.length) throw new Error("주소를 찾을 수 없습니다. 정확한 농경지 주소를 입력해주세요.");
      ({ lat, lng, stdgCd } = hits[0]);
    }

    // 2) 최근접 관측소 + 현재 시각
    const station = nearestStation(lat, lng);
    const { dateStr, timeStr } = nowDateTime();

    // 3) 토양·기상·농지여부
    const mergedRes = await fetch(
      `${API_BASE_URL}/api/getMergedData?stationId=${station.id}&lat=${lat}&lng=${lng}` +
        `&stdgCd=${encodeURIComponent(stdgCd)}&dateStr=${dateStr}&timeStr=${timeStr}`,
      { signal: AbortSignal.timeout(20000) }
    );
    const env = await mergedRes.json();
    if (!mergedRes.ok) throw new Error(env.error || "토양·기상 데이터 수집 실패");

    // 4) 등록된 농경지가 아니면(false) 차단. null(확인 실패)은 통과.
    if (env.isFarmland === false) {
      return {
        error:
          "입력하신 주소는 팜맵에 등록된 농경지가 아닙니다. 실제 농경지 주소인지 확인해주세요.",
      };
    }

    // 5) 추천 (토양값을 쿼리로 전달)
    const params = new URLSearchParams({
      crop,
      soilPh: env.soilPh,
      soilOrganic: env.soilOrganic,
      soilPhosphate: env.soilPhosphate,
      soilPotassium: env.soilPotassium,
      soilCalcium: env.soilCalcium,
      soilMagnesium: env.soilMagnesium,
      soilMoisture: env.soilMoisture,
      airTemp: env.airTemp,
      rain: env.rain,
    });
    const recRes = await fetch(`${API_BASE_URL}/api/recommendMicrobe?${params}`, {
      signal: AbortSignal.timeout(60000),
    });
    const rec = await recRes.json();
    if (!recRes.ok) throw new Error(rec.error || "추천 요청 실패");

    // 토양 출처/농지 정보 + 실제 연동해온 토양·기상 원본 값을 함께 실어줌
    // (결과 화면 "내 토양 정보 보기"에서 그대로 표시)
    return {
      ...rec,
      // 근거 강도 신호 패스스루(백엔드 /api/recommendMicrobe 응답). ...rec로 이미 실려오지만
      // 결과 화면이 의존하므로 명시적으로 둔다.
      evidenceConfidence: rec.evidenceConfidence,
      evidenceScore: rec.evidenceScore,
      soilDataSource: env.soilDataSource,
      isFarmland: env.isFarmland,
      landUseType: env.landUseType,
      soilInfo: {
        soilPh: env.soilPh,
        soilOrganic: env.soilOrganic,
        soilPhosphate: env.soilPhosphate,
        soilPotassium: env.soilPotassium,
        soilCalcium: env.soilCalcium,
        soilMagnesium: env.soilMagnesium,
        soilSilicate: env.soilSilicate,
        soilEc: env.soilEc,
        soilMoisture: env.soilMoisture,
        soilTemp: env.soilTemp,
        airTemp: env.airTemp,
        rain: env.rain,
        solarRadiation: env.solarRadiation,
        soilDataSource: env.soilDataSource,
        timestamp: env.timestamp,
      },
    };
  } catch (e) {
    console.warn("[TOBio] 추천 파이프라인 실패:", e.message);
    return { error: e.message || "네트워크 오류가 발생했습니다." };
  }
}

/* ── 살포 확인 (spray sequence) ───────────────────────────── */
// 자재 자동완성: [{ name, type, family }]
export async function searchSprayMaterials(q) {
  if (!q || q.trim().length < 1) return [];
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/sprayMaterials?q=${encodeURIComponent(q.trim())}&limit=10`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch (e) {
    console.warn("[TOBio] 자재 검색 실패:", e.message);
    return [];
  }
}

// 학명처럼 보이면(라틴 2단어) inoculantSpecies로 보내 백엔드가 세균/곰팡이 자동판정하게 함
function looksLikeSpecies(name) {
  return /^[A-Za-z][A-Za-z.\-]+\s+[A-Za-z][A-Za-z.\-]+/.test((name || "").trim());
}

// 백엔드 server.js의 BACTERIA_GENERA/FUNGUS_GENERA/classifyInoculantSpecies 사본.
// ⚠️ "종류 선택" 버튼을 자동으로 미리 골라주는 화면 표시용이라, 백엔드 목록이 바뀌면 같이 맞춰야 함.
const BACTERIA_GENERA = new Set([
  "bacillus", "paenibacillus", "pseudomonas", "lactobacillus", "lactiplantibacillus", "lacticaseibacillus",
  "limosilactobacillus", "latilactobacillus", "lactococcus", "priestia", "streptomyces", "azospirillum", "rhizobium",
  "bradyrhizobium", "sinorhizobium", "mesorhizobium", "azotobacter", "burkholderia", "paraburkholderia",
  "serratia", "lysobacter", "enterobacter", "klebsiella", "gluconacetobacter", "acetobacter", "nitrobacter",
  "nitrosomonas", "rhodopseudomonas", "rhodobacter", "micrococcus", "arthrobacter", "agrobacterium",
  "photorhabdus",
]);
const FUNGUS_GENERA = new Set([
  "trichoderma", "beauveria", "metarhizium", "glomus", "funneliformis", "rhizophagus", "claroideoglomus",
  "paecilomyces", "purpureocillium", "aspergillus", "penicillium", "clonostachys", "gliocladium",
  "coniothyrium", "ampelomyces", "lecanicillium", "verticillium", "isaria", "cordyceps", "pochonia",
  "saccharomyces", "candida", "pichia", "aureobasidium", "talaromyces",
]);

// 추천 결과에서 넘어온 학명으로 "세균제/곰팡이제" 종류 버튼을 미리 선택해줌. 모르면 "both".
export function classifyInoculantSpecies(speciesName) {
  if (!looksLikeSpecies(speciesName)) return "both";
  const genus = speciesName.trim().split(/\s+/)[0].toLowerCase();
  if (BACTERIA_GENERA.has(genus)) return "bacteria";
  if (FUNGUS_GENERA.has(genus)) return "fungus";
  return "both";
}

// payload: { inoculantName, inoculantType, inoculantDate, materials:[{name,kind,appliedDate}] }
export async function fetchSpraySequence({ inoculantName, inoculantType, inoculantDate, materials }) {
  const body = {
    materials: (materials || [])
      .filter((m) => (m.name || "").trim() && (m.appliedDate || "").trim())
      .map((m) => ({ name: m.name.trim(), kind: m.kind || undefined, appliedDate: m.appliedDate })),
    inoculantType: inoculantType || "both",
    inoculantDate: inoculantDate || undefined,
  };
  if (looksLikeSpecies(inoculantName)) body.inoculantSpecies = inoculantName.trim();

  try {
    const res = await fetch(`${API_BASE_URL}/api/spraySequence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `요청 실패 (HTTP ${res.status})`);
    return json;
  } catch (e) {
    console.warn("[TOBio] 살포 시퀀스 실패:", e.message);
    return { error: e.message || "살포 확인 중 오류가 발생했습니다." };
  }
}
