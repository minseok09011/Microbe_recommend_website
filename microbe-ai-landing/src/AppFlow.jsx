import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  X,
  AlertTriangle,
  CheckCircle2,
  ShieldQuestion,
  Info,
  Phone,
  ShoppingCart,
  Crown,
  Tag,
  Sprout,
  Thermometer,
  Droplets,
  CloudRain,
  Sun,
  ChevronDown,
  Lightbulb,
} from "lucide-react";
import { CROPS, LOAD_STEPS, delay, searchAddress, fetchRecommend, searchSprayMaterials, fetchSpraySequence } from "./data.js";
import SaveRecordButton from "./SaveRecordButton.jsx";
import { listMyRecentAddresses } from "./records.js";
import { Reveal } from "./LandingPage.jsx";

export function TopBar({ title, onBack, backLabel }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-sm border-b border-stone-200 px-5 py-3.5">
      <button onClick={onBack} className="flex items-center gap-1 text-stone-500 hover:text-emerald-700 -ml-1 px-1 transition-colors">
        <ArrowLeft className="h-5 w-5" />
        {backLabel && <span className="text-sm font-semibold">{backLabel}</span>}
      </button>
      <img src="img/tobio.png" alt="" className="h-6 w-auto object-contain ml-1" />
      <span className="font-bold text-stone-900">{title}</span>
    </div>
  );
}

const PRIMARY_BTN =
  "inline-flex items-center justify-center gap-2 w-full rounded-md bg-amber-500 hover:bg-amber-400 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed text-black font-semibold py-3.5 transition-colors";
const SECONDARY_BTN =
  "inline-flex items-center justify-center gap-2 rounded-md border-2 border-emerald-700 text-emerald-700 font-semibold hover:bg-emerald-50 transition-colors";

export function StepDots({ step, total = 2 }) {
  return (
    <div className="flex items-center justify-center gap-1.5 pt-4">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-7 rounded-full transition-colors ${
            i < step ? "bg-emerald-700" : i === step ? "bg-amber-500" : "bg-stone-200"
          }`}
        />
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   STEP 1: 작물 선택
────────────────────────────────────────────────────────────── */
export function CropSelect({ crop, onSelect, onBack, onNext }) {
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <TopBar title="미생물 추천받기" onBack={onBack} />
      <StepDots step={0} />
      <div className="flex-1 max-w-lg w-full mx-auto px-5 py-6">
        <Reveal>
          <h2 className="text-xl font-bold text-stone-900 mb-1">어떤 작물을 재배하시나요?</h2>
          <p className="text-sm text-stone-500 mb-6">작물을 선택하면 맞춤 미생물을 찾아드려요</p>
        </Reveal>

        <Reveal delay={80}>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-8">
            {CROPS.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`rounded-xl border-2 py-4 px-2 text-center transition-all ${
                  crop === c.id
                    ? "border-emerald-600 bg-emerald-50 -translate-y-0.5 shadow-sm"
                    : "border-stone-200 bg-white hover:border-emerald-300"
                }`}
              >
                <div className="text-2xl mb-1">{c.icon}</div>
                <div className="text-xs font-semibold text-stone-700">{c.name}</div>
              </button>
            ))}
          </div>
        </Reveal>

        <button disabled={!crop} onClick={onNext} className={PRIMARY_BTN}>
          다음
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   STEP 2: 주소 입력
────────────────────────────────────────────────────────────── */
export function AddressInput({ address, onSelect, onBack, onNext, user }) {
  const [query, setQuery] = useState(address?.address || "");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentAddresses, setRecentAddresses] = useState([]);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) {
      setRecentAddresses([]);
      return;
    }
    listMyRecentAddresses()
      .then(setRecentAddresses)
      .catch(() => setRecentAddresses([]));
  }, [user]);

  function pickRecent(addr) {
    setQuery(addr.address);
    onSelect({ address: addr.address });
    setShowDropdown(false);
  }

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    onSelect(null);
    clearTimeout(timerRef.current);
    setShowDropdown(false);
    if (q.trim().length < 2) return;
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      const r = await searchAddress(q);
      setSearching(false);
      setResults(r);
      setShowDropdown(true);
    }, 350);
  }

  function pickDummy() {
    onSelect({ address: query, detail: "임시 주소 데이터", pnu: "DUMMY" });
    setShowDropdown(false);
  }
  function pickResult(r) {
    onSelect(r);
    setShowDropdown(false);
  }
  function clearAddress() {
    onSelect(null);
    setQuery("");
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <TopBar title="미생물 추천받기" onBack={onBack} />
      <StepDots step={1} />
      <div className="flex-1 max-w-lg w-full mx-auto px-5 py-6">
        <Reveal>
          <h2 className="text-xl font-bold text-stone-900 mb-1">농경지 주소를 알려주세요</h2>
          <p className="text-sm text-stone-500 mb-6">주소를 입력하면 팜맵에서 실제 농경지를 확인해드려요</p>
        </Reveal>

        {recentAddresses.length > 0 && !address && (
          <Reveal>
            <p className="text-xs font-semibold text-stone-500 mb-2">📍 최근에 사용한 주소</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {recentAddresses.map((a, i) => (
                <button
                  key={i}
                  onClick={() => pickRecent(a)}
                  className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
                >
                  {a.address}
                </button>
              ))}
            </div>
          </Reveal>
        )}

        <label className="block text-sm font-semibold text-stone-700 mb-2">도로명 주소를 입력하세요</label>
        <div ref={wrapRef} className="relative mb-4">
          <input
            value={query}
            onChange={handleInput}
            placeholder="지번 또는 도로명 주소 입력 (예: 충남 아산시 배방읍)"
            autoComplete="off"
            className={`w-full rounded-xl border-2 px-4 py-3.5 text-sm outline-none transition-colors ${
              address ? "border-emerald-600" : "border-stone-200 focus:border-emerald-500"
            }`}
          />
          {searching && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg text-center text-sm text-stone-500 py-3.5 z-20">
              🔍 팜맵에서 주소를 검색하고 있어요...
            </div>
          )}
          {showDropdown && !searching && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-56 overflow-y-auto z-20">
              {results.length === 0 ? (
                <div onClick={pickDummy} className="px-4 py-3 cursor-pointer hover:bg-emerald-50">
                  <div className="font-semibold text-sm text-stone-800">&quot;{query}&quot; 주소로 진행하기</div>
                  <div className="text-xs text-stone-500 mt-0.5">주소 검색 결과가 없어 입력하신 주소로 진행합니다</div>
                </div>
              ) : (
                results.map((r, i) => (
                  <div
                    key={i}
                    onClick={() => pickResult(r)}
                    className="px-4 py-3 cursor-pointer border-b border-stone-100 last:border-0 hover:bg-emerald-50"
                  >
                    <div className="font-semibold text-sm text-stone-800">
                      {r.address || r.roadAddr || r.jibunAddr || ""}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">{r.detail || r.admNm || r.pnu || ""}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {address && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-600 rounded-xl px-4 py-3 mb-4 text-sm font-semibold text-emerald-800">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{address.address || address.roadAddr || address.jibunAddr || "주소 선택됨"}</span>
            <button onClick={clearAddress} className="text-stone-400 hover:text-stone-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <button disabled={!address} onClick={onNext} className={`${PRIMARY_BTN} mt-2`}>
          🌱 추천받기
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   로딩 화면 — 토비오 걷기 애니메이션 + 진행 단계
────────────────────────────────────────────────────────────── */
export function LoadingScreen({ crop, address, onDone }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [pct, setPct] = useState(0);
  const cropMeta = CROPS.find((c) => c.id === crop);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const STEP_DELAYS = [800, 2200, 1800, 0];
      const apiPromise = fetchRecommend(crop, address);

      for (let i = 1; i <= LOAD_STEPS.length; i++) {
        if (i < LOAD_STEPS.length) {
          await delay(STEP_DELAYS[i - 1]);
          if (cancelled) return;
          setStepIdx(i);
          setPct((i / LOAD_STEPS.length) * 100);
        }
      }

      const result = await apiPromise;
      if (cancelled) return;
      await delay(600);
      if (cancelled) return;
      setStepIdx(LOAD_STEPS.length);
      setPct(100);
      await delay(200);
      if (cancelled) return;
      onDone(result);
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center text-center px-6">
      <style>{`
        .tobio-sprite-frame {
          background-image: url(img/tobio-walk-1.png);
          background-repeat: no-repeat;
          background-size: contain;
          background-position: center;
          animation: tobio-walk-bob 0.5s ease-in-out infinite alternate, tobio-sprite-cycle 0.8s steps(1) infinite;
        }
        @keyframes tobio-sprite-cycle {
          0%, 12.49% { background-image: url(img/tobio-walk-1.png); }
          12.5%, 37.49% { background-image: url(img/tobio-walk-2.png); }
          37.5%, 62.49% { background-image: url(img/tobio-walk-3.png); }
          62.5%, 87.49% { background-image: url(img/tobio-walk-4.png); }
          87.5%, 100% { background-image: url(img/tobio-walk-1.png); }
        }
      `}</style>

      <h2 className="text-lg font-bold text-stone-900 mb-1">토비오가 분석하고 있습니다</h2>
      <p className="text-sm text-stone-500 mb-6">
        {cropMeta ? `${cropMeta.icon} ${cropMeta.name} 밭을 위한 미생물을 찾고 있어요...` : "잠시만 기다려 주세요..."}
      </p>

      <div className="relative w-full max-w-[360px] h-[130px] mb-6">
        <div
          className="absolute left-1 bottom-[18px] h-2 rounded-full bg-emerald-700 transition-[width] duration-[1100ms] ease-in-out"
          style={{ width: `${pct}%` }}
        />
        <div
          className="tobio-sprite-frame absolute bottom-[26px] w-[60px] h-[94px] -translate-x-1/2 transition-[left] duration-[1100ms] ease-in-out"
          style={{ left: `${pct}%` }}
        />
      </div>

      <div className="w-full max-w-[360px] space-y-2.5 text-left">
        {LOAD_STEPS.map((s, i) => {
          const status = i < stepIdx ? "done" : i === stepIdx ? "active" : "pending";
          return (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-sm transition-colors ${
                status === "done"
                  ? "bg-emerald-50"
                  : status === "pending"
                  ? "bg-white opacity-45"
                  : "bg-white border-l-4 border-amber-500"
              }`}
            >
              <span className="text-lg w-6 text-center">{s.icon}</span>
              <span className="flex-1 text-sm font-semibold text-stone-800">
                {status === "done" ? s.doneLabel : s.label}
              </span>
              <span>{status === "done" ? "✅" : status === "active" ? "⏳" : "⬜"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 결과 화면 — "내 토양 정보 보기" 패널 (백엔드 getMergedData 연동 원본값) */
function SoilInfoPanel({ soilInfo }) {
  const SOURCE_BADGE = {
    "실측값": { icon: "🛰️", className: "bg-emerald-50 text-emerald-700" },
    "지역 추정값": { icon: "📊", className: "bg-stone-100 text-stone-600" },
    "전국 평균값": { icon: "ℹ️", className: "bg-amber-50 text-amber-700" },
  };
  const badge = SOURCE_BADGE[soilInfo.soilDataSource];

  const soilRows = [
    { icon: Droplets, label: "토양 산도 (pH)", value: soilInfo.soilPh, unit: "" },
    { icon: Sprout, label: "유기물", value: soilInfo.soilOrganic, unit: "g/kg" },
    { icon: Sprout, label: "유효인산", value: soilInfo.soilPhosphate, unit: "mg/kg" },
    { icon: Sprout, label: "칼륨", value: soilInfo.soilPotassium, unit: "cmol+/kg" },
    { icon: Sprout, label: "칼슘", value: soilInfo.soilCalcium, unit: "cmol+/kg" },
    { icon: Sprout, label: "마그네슘", value: soilInfo.soilMagnesium, unit: "cmol+/kg" },
    { icon: Sprout, label: "유효규산", value: soilInfo.soilSilicate, unit: "mg/kg" },
    { icon: Droplets, label: "전기전도도 (EC)", value: soilInfo.soilEc, unit: "dS/m" },
  ].filter((r) => r.value !== null && r.value !== undefined);

  const envRows = [
    { icon: Droplets, label: "토양 수분", value: soilInfo.soilMoisture, unit: "%" },
    { icon: Thermometer, label: "지온", value: soilInfo.soilTemp, unit: "°C" },
    { icon: Thermometer, label: "기온", value: soilInfo.airTemp, unit: "°C" },
    { icon: CloudRain, label: "강수량", value: soilInfo.rain, unit: "mm" },
    { icon: Sun, label: "일사량", value: soilInfo.solarRadiation, unit: "" },
  ].filter((r) => r.value !== null && r.value !== undefined);

  const fmt = (v) => (typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : v);

  return (
    <Reveal>
      <div className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4 mt-2">
        {badge && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold mb-3 ${badge.className}`}>
            {badge.icon} {soilInfo.soilDataSource}
          </span>
        )}

        {soilRows.length > 0 && (
          <>
            <p className="text-xs font-bold text-stone-500 mb-2">🌱 토양 성분</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {soilRows.map((r) => (
                <div key={r.label} className="rounded-xl bg-stone-50 px-3 py-2">
                  <p className="text-[11px] text-stone-400">{r.label}</p>
                  <p className="text-sm font-semibold text-stone-800">
                    {fmt(r.value)}
                    {r.unit && <span className="text-[11px] font-normal text-stone-400"> {r.unit}</span>}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {envRows.length > 0 && (
          <>
            <p className="text-xs font-bold text-stone-500 mb-2">🌤️ 기상 환경</p>
            <div className="grid grid-cols-2 gap-2">
              {envRows.map((r) => (
                <div key={r.label} className="rounded-xl bg-stone-50 px-3 py-2">
                  <p className="text-[11px] text-stone-400">{r.label}</p>
                  <p className="text-sm font-semibold text-stone-800">
                    {fmt(r.value)}
                    {r.unit && <span className="text-[11px] font-normal text-stone-400"> {r.unit}</span>}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {soilInfo.timestamp && (
          <p className="mt-3 text-[11px] text-stone-400">측정 시각: {soilInfo.timestamp}</p>
        )}
      </div>
    </Reveal>
  );
}

/* ──────────────────────────────────────────────────────────────
   결과 화면
────────────────────────────────────────────────────────────── */
export function ResultScreen({ result, crop, address, onCheck, onHome }) {
  const [showAll, setShowAll] = useState(false);
  const [showSoilInfo, setShowSoilInfo] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [vendorCounts, setVendorCounts] = useState({});
  const [showReasons, setShowReasons] = useState({});
  const toggleReason = (i) => setShowReasons((prev) => ({ ...prev, [i]: !prev[i] }));
  const getVendorCount = (i) => vendorCounts[i] ?? 3;
  const showMoreVendors = (i) => setVendorCounts((prev) => ({ ...prev, [i]: getVendorCount(i) + 5 }));
  const collapseVendors = (i) => setVendorCounts((prev) => ({ ...prev, [i]: 3 }));
  const cropName = CROPS.find((c) => c.id === crop)?.name || crop || "";
  const addrName = address?.address || address?.roadAddr || address?.jibunAddr || "입력 주소";

  if (!result || result.error) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col">
        <TopBar title="추천 결과" onBack={onHome} backLabel="홈" />
        <div className="flex-1 max-w-lg w-full mx-auto px-5 py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-rose-500 mx-auto mb-3" />
          <h3 className="font-bold text-stone-900 mb-2">추천을 가져오지 못했습니다</h3>
          <p className="text-sm text-stone-500 mb-6">{result?.error || "네트워크 오류가 발생했습니다."}</p>
          <button onClick={onHome} className={`${SECONDARY_BTN} px-7 py-3`}>
            홈으로
          </button>
        </div>
      </div>
    );
  }

  const microbes = result.microbes || result.recommendations || (Array.isArray(result) ? result : [result]);
  const explanation = result.explanation || "";
  const scientificEvidence = result.scientificEvidence || "";
  const sources = Array.isArray(result.sources) ? result.sources : [];

  // 근거 강도/토양 출처는 "꽉 찬 별"만으로 표시(빈 별 ☆ 안 씀). 값이 없으면 항목 생략(안전).
  const EVIDENCE_STARS = { strong: "★★★★★", moderate: "★★★★", weak: "★★★" };
  const evidenceStars = EVIDENCE_STARS[result.evidenceConfidence];
  const topScore = result?.evidenceScore?.topScore;
  const SOIL_STARS = { "실측값": "★★★★★", "지역 추정값": "★★★★", "전국 평균값": "★★★" };
  const soilStars = SOIL_STARS[result.soilDataSource];

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <TopBar title="추천 결과" onBack={onHome} backLabel="홈" />
      <div className="flex-1 max-w-lg w-full mx-auto px-5 py-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-600 text-white p-5 mb-5">
            <img
              src="img/tobio.png"
              alt=""
              className="absolute -right-4 -bottom-6 h-28 w-auto object-contain opacity-90"
            />
            <div className="relative">
              <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/80 mb-2">
                AI Recommendation
              </span>
              <h2 className="font-bold text-lg mb-1">토비오의 미생물 추천</h2>
              <p className="text-sm text-white/85">
                작물: {cropName} &nbsp;|&nbsp; 농경지: {addrName}
              </p>
              {result.landUseType && (
                <p className="text-xs text-white/70 mt-1">✅ 확인된 농경지: {result.landUseType}</p>
              )}
            </div>
          </div>
        </Reveal>

        {/* 토양 데이터 출처 안내 (백엔드 soilDataSource) — 상황 설명 위에 먼저, 별점과 함께 */}
        {result.soilDataSource === "전국 평균값" && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 mb-3 text-xs text-amber-800 leading-relaxed">
            <span className="text-amber-500 mr-1">{soilStars}</span>
            ℹ️ 이 주소의 실측·지역 토양 데이터가 없어 <strong>전국 평균값</strong>으로 추천했어요. 정확한 농경지 지번 주소를 입력하면 실측값 기준으로 더 정확해집니다.
          </div>
        )}
        {result.soilDataSource === "지역 추정값" && (
          <div className="bg-stone-100 rounded-2xl p-3.5 mb-3 text-xs text-stone-600 leading-relaxed">
            <span className="text-amber-500 mr-1">{soilStars}</span>
            📊 이 농경지의 실측 기록이 없어, <strong>해당 지역(법정동) 토양 통계</strong>로 추정한 값을 기준으로 추천했어요.
          </div>
        )}
        {result.soilDataSource === "실측값" && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5 mb-3 text-xs text-emerald-800 leading-relaxed">
            <span className="text-amber-500 mr-1">{soilStars}</span>
            🛰️ 이 농경지의 <strong>실측 토양검정 데이터</strong>를 기준으로 추천했어요.
          </div>
        )}

        {/* 상황 설명 (백엔드 explanation) */}
        {explanation && (
          <Reveal>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-3 text-sm text-emerald-900">
              <p className="font-bold mb-1.5">🔍 상황 설명</p>
              <p className={`leading-relaxed ${showExplanation ? "" : "line-clamp-4"}`}>{explanation}</p>
              <button
                onClick={() => setShowExplanation((v) => !v)}
                className="mt-2 text-xs font-semibold text-emerald-700 underline"
              >
                {showExplanation ? "접기" : "자세히 보기"}
              </button>
            </div>
          </Reveal>
        )}

        {/* 내 토양 정보 보기 (백엔드 soilInfo) */}
        {result.soilInfo && (
          <div className="mb-3">
            <button
              onClick={() => setShowSoilInfo((v) => !v)}
              className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left shadow-sm hover:border-emerald-300 transition-colors"
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-stone-800">
                <Sprout className="h-4 w-4 text-emerald-700" />내 토양 정보 보기
              </span>
              <ChevronDown
                className={`h-4 w-4 text-stone-400 transition-transform ${showSoilInfo ? "rotate-180" : ""}`}
              />
            </button>

            {showSoilInfo && <SoilInfoPanel soilInfo={result.soilInfo} />}
          </div>
        )}

        {/* AI 무료 사용량 한도 (백엔드 quotaExceeded) */}
        {result.quotaExceeded && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 mb-3 text-xs text-amber-800 leading-relaxed">
            ⚠️ 현재 AI 무료 사용량 한도에 도달해 추천 균종 목록이 비어 있을 수 있어요. 잠시 후 다시 시도해주세요.
          </div>
        )}

        <div className="space-y-3.5 mb-5">
          {microbes.length === 0 && !result.quotaExceeded && <p className="text-center text-stone-500 py-5">추천 결과가 없습니다.</p>}
          {(showAll ? microbes : microbes.slice(0, 3)).map((m, i) => {
            const species = m.species || m.name || m.korName || m.korean_name || "미생물명";
            const vendor = m.vendorInfo;
            const tags = m.tags || m.effects || [];
            const vendors = vendor?.vendors || m.sellers || m.products || [];
            const isTop = i === 0;
            return (
              <Reveal key={i} delay={i * 80}>
                <div
                  className={`bg-white rounded-2xl overflow-hidden ${
                    isTop ? "border-2 border-amber-400 shadow-md" : "border border-stone-200 shadow-sm"
                  }`}
                >
                  <div className={`flex items-center gap-1.5 px-4 py-2.5 ${isTop ? "bg-amber-400" : "bg-emerald-700"}`}>
                    {isTop ? (
                      <>
                        <Crown className="h-4 w-4 text-black" strokeWidth={2.5} />
                        <span className="text-sm font-bold text-black">토비오의 최고 추천</span>
                      </>
                    ) : (
                      <span className="text-xs font-bold text-white">👍 추천 {i + 1}위</span>
                    )}
                  </div>

                  <div className="p-5">
                    <div className="font-bold text-xl text-stone-900 italic">{species}</div>

                    {vendor && (
                      <div className="flex flex-wrap items-center gap-2 mt-2.5 mb-3.5">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full ${
                            vendor.registered ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-600"
                          }`}
                        >
                          {vendor.registered ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldQuestion className="h-3.5 w-3.5" />
                          )}
                          {vendor.registered ? "농약/비료 등록됨" : "미등록 제품"}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">
                          등록 제품 {vendor.productCount ?? 0}개
                        </span>
                      </div>
                    )}

                    {vendor?.matchType === "epithet" && vendor?.matchedName && (
                      <div className="flex items-start gap-2 rounded-xl bg-sky-50 text-sky-800 text-xs px-3 py-2.5 mb-3.5 leading-relaxed">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>
                          &quot;{species}&quot;와 표기가 달라, 같은 균종으로 보이는 &quot;{vendor.matchedName}&quot; 제품을 보여드려요.
                        </span>
                      </div>
                    )}
                    {vendor?.matchType === "genus" && vendor?.matchedName && (
                      <div className="flex items-start gap-2 rounded-xl bg-sky-50 text-sky-800 text-xs px-3 py-2.5 mb-3.5 leading-relaxed">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>
                          &quot;{species}&quot;와 정확히 일치하는 제품은 없어, 같은 속(genus)인 &quot;{vendor.matchedName}&quot; 계열 제품을 모아 보여드려요.
                        </span>
                      </div>
                    )}

                    {m.reason && (
                      <div className="mb-3.5">
                        <button
                          onClick={() => toggleReason(i)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-200 transition-colors"
                        >
                          <Lightbulb className="h-3.5 w-3.5" />
                          AI 선정 이유 {showReasons[i] ? "접기" : "보기"}
                        </button>
                        {showReasons[i] && (
                          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 text-amber-900 text-xs px-3 py-2.5 mt-2 leading-relaxed">
                            <Lightbulb className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>{m.reason}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {(m.description || m.effect) && (
                      <p className="text-sm text-stone-700 leading-relaxed mb-3.5">
                        {m.description || m.effect}
                      </p>
                    )}

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3.5">
                        {tags.map((t, ti) => (
                          <span
                            key={ti}
                            className="bg-emerald-50 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-full"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {vendors.length > 0 && (
                      <div>
                        <h5 className="text-xs font-bold text-stone-500 mb-2">
                          🛒 구매 가능 판매처 ({vendors.length}곳)
                        </h5>
                        <div className="space-y-2">
                          {vendors.slice(0, getVendorCount(i)).map((v, vi) => {
                            const products = v.products || [
                              { product: v.productName || v.name, price: v.price, contact: v.phone, onlineUrl: v.onlineUrl },
                            ];
                            const productLabel = products[0]?.product
                              ? `${products[0].product}${products.length > 1 ? ` 외 ${products.length - 1}개` : ""}`
                              : "";
                            const priceLabel = products.map((p) => p.price).filter(Boolean).join(", ");
                            const onlineUrl = products.find((p) => p.onlineUrl)?.onlineUrl;
                            const contact = products[0]?.contact;
                            return (
                              <div
                                key={vi}
                                className={`rounded-xl border-l-4 ${
                                  isTop ? "border-l-amber-400" : "border-l-emerald-600"
                                } border-y border-r border-stone-200 bg-stone-50 px-3.5 py-3 text-xs`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <strong className="text-sm text-stone-900">{v.company || v.seller || ""}</strong>
                                  {priceLabel && (
                                    <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 whitespace-nowrap">
                                      <Tag className="h-3 w-3" />
                                      {priceLabel}
                                    </span>
                                  )}
                                </div>
                                {productLabel && <div className="text-stone-600 mt-1">{productLabel}</div>}
                                {(contact || onlineUrl) && (
                                  <div className="mt-1.5 flex items-center gap-2">
                                    {contact && (
                                      <a
                                        href={`tel:${contact.replace(/[^0-9]/g, "")}`}
                                        className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-stone-700 hover:border-emerald-400"
                                      >
                                        <Phone className="h-3 w-3" />
                                        {contact}
                                      </a>
                                    )}
                                    {onlineUrl && (
                                      <a
                                        href={onlineUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-white hover:bg-emerald-800"
                                      >
                                        <ShoppingCart className="h-3 w-3" />
                                        온라인 구매
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {(vendors.length > getVendorCount(i) || getVendorCount(i) > 3) && (
                          <div className="mt-2 flex gap-2">
                            {vendors.length > getVendorCount(i) && (
                              <button
                                onClick={() => showMoreVendors(i)}
                                className="flex-1 rounded-md border border-stone-300 py-2 text-xs font-semibold text-stone-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
                              >
                                판매처 더보기 (+{Math.min(5, vendors.length - getVendorCount(i))})
                              </button>
                            )}
                            {getVendorCount(i) > 3 && (
                              <button
                                onClick={() => collapseVendors(i)}
                                className="flex-1 rounded-md border border-stone-300 py-2 text-xs font-semibold text-stone-600 hover:border-stone-400 transition-colors"
                              >
                                접기
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        {!showAll && microbes.length > 3 && (
          <button
            onClick={() => setShowAll(true)}
            className={`${SECONDARY_BTN} w-full py-2.5 mb-5 -mt-1.5`}
          >
            추천 {microbes.length}개 모두 보기 (상세보기)
          </button>
        )}

        {/* 논문 근거 더보기 (백엔드 scientificEvidence + sources) */}
        {(scientificEvidence || sources.length > 0) && (
          <details className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 mb-5">
            <summary className="cursor-pointer text-sm font-semibold text-stone-900 select-none">
              📄 더보기 — 논문 근거로 살펴보기
            </summary>
            {evidenceStars && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm font-bold text-stone-900">논문 근거 강도</span>
                <span className="text-amber-500 text-base leading-none tracking-tight" aria-label={`근거 강도 ${result.evidenceConfidence}`}>{evidenceStars}</span>
                {Number.isFinite(topScore) && <span className="text-xs text-stone-400">(유사도 {topScore.toFixed(2)})</span>}
              </div>
            )}
            {scientificEvidence && (
              <p className="mt-3 text-sm text-stone-700 leading-relaxed">{scientificEvidence}</p>
            )}
            {sources.length > 0 && (
              <>
                <p className="mt-3 mb-1.5 text-xs font-bold text-stone-500">참고 논문 {sources.length}건</p>
                <ul className="space-y-1.5">
                  {sources.map((s, si) => {
                    const meta = [s.journal, s.year].filter(Boolean).join(", ");
                    return (
                      <li key={si} className="text-xs text-stone-700 leading-relaxed">
                        {s.doi ? (
                          <a
                            href={`https://doi.org/${s.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 underline"
                          >
                            {s.title}
                          </a>
                        ) : (
                          <span>{s.title}</span>
                        )}
                        {meta && <span className="text-stone-400"> ({meta})</span>}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </details>
        )}

        <div className="bg-stone-100 border border-stone-200 rounded-2xl p-4 text-center mb-3">
          <p className="text-sm font-semibold text-stone-800 mb-3">
            🧪 추천받은 미생물, 살포 가능 확인도 함께 해보시겠어요?
          </p>
          <button onClick={onCheck} className={PRIMARY_BTN}>
            살포 가능 확인하기
          </button>
        </div>
        {/* 로그인 상태면 추천 결과를 내 기록에 저장 (로그인은 선택) */}
        <div className="mb-3">
          <SaveRecordButton
            build={() => ({
              kind: "recommend",
              crop: cropName,
              title: `${cropName || "작물"} 추천 미생물`,
              summary: microbes
                .map((m) => m.species || m.name || m.korName || m.korean_name)
                .filter(Boolean)
                .slice(0, 3)
                .join(", "),
              payload: { result, crop, cropName, address: addrName },
            })}
          />
        </div>

        <button onClick={onHome} className={`${SECONDARY_BTN} w-full py-3`}>
          홈으로 돌아가기
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   살포 가능 확인 화면 (살포 시퀀스)
   "전에 무슨 약제를 언제 뿌렸는지" + "뿌릴 미생물 종류"를 받아
   백엔드 /api/spraySequence 로 안전 살포일을 계산한다.
────────────────────────────────────────────────────────────── */
const RISK_LABEL = { "🔴": "위험", "🟡": "주의", "🟢": "안전" };

function todayStr() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

/* 자재 한 줄 — 이름(자동완성) + 살포일 + 삭제 */
function MaterialRow({ row, onChange, onRemove, canRemove }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    function outside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, []);

  function handleName(e) {
    const name = e.target.value;
    onChange({ ...row, name, kind: undefined, family: undefined }); // 직접 수정하면 자동완성 메타 초기화
    clearTimeout(timerRef.current);
    setOpen(false);
    if (name.trim().length < 1) return;
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      const r = await searchSprayMaterials(name);
      setSearching(false);
      setResults(r);
      setOpen(true);
    }, 300);
  }

  function pick(item) {
    onChange({ ...row, name: item.name, kind: item.type, family: item.family });
    setOpen(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 mb-2.5">
      <div className="flex items-start gap-2">
        <div ref={wrapRef} className="relative flex-1">
          <input
            value={row.name}
            onChange={handleName}
            placeholder="약제·비료 이름 (예: 코사이드, 오티바)"
            autoComplete="off"
            className="w-full rounded-md border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
          />
          {row.family && (
            <span className="mt-1 inline-block text-[11px] text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
              {row.family}
            </span>
          )}
          {searching && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg text-center text-xs text-stone-500 py-2.5 z-20">
              검색 중...
            </div>
          )}
          {open && !searching && results.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-52 overflow-y-auto z-20">
              {results.map((item, i) => (
                <div
                  key={i}
                  onClick={() => pick(item)}
                  className="px-3 py-2 cursor-pointer border-b border-stone-100 last:border-0 hover:bg-emerald-50"
                >
                  <div className="text-sm font-semibold text-stone-800">{item.name}</div>
                  <div className="text-xs text-stone-500">{item.family || item.type || ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {canRemove && (
          <button onClick={onRemove} className="text-stone-400 hover:text-rose-500 pt-2.5" aria-label="삭제">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-xs font-semibold text-stone-500 w-16">살포한 날</span>
        <input
          type="date"
          value={row.appliedDate}
          max={todayStr()}
          onChange={(e) => onChange({ ...row, appliedDate: e.target.value })}
          className="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
        />
      </div>
    </div>
  );
}

const newMaterial = () => ({ name: "", kind: undefined, family: undefined, appliedDate: todayStr() });

export function CheckScreen({ prefill, onBack, onResult }) {
  const [inoculantName, setInoculantName] = useState(prefill?.microbe || "");
  const [inoculantType, setInoculantType] = useState("both"); // bacteria | fungus | both
  const [inoculantDate, setInoculantDate] = useState(todayStr());
  const [materials, setMaterials] = useState([newMaterial()]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setInoculantName(prefill?.microbe || "");
    setInoculantType("both");
    setInoculantDate(todayStr());
    setMaterials([newMaterial()]);
  }, [prefill]);

  function updateMaterial(idx, next) {
    setMaterials((prev) => prev.map((m, i) => (i === idx ? next : m)));
  }
  function removeMaterial(idx) {
    setMaterials((prev) => prev.filter((_, i) => i !== idx));
  }
  function addMaterial() {
    setMaterials((prev) => [...prev, newMaterial()]);
  }

  async function handleCheck() {
    const valid = materials.filter((m) => m.name.trim() && m.appliedDate);
    if (valid.length === 0) {
      alert("최근에 살포한 약제·비료를 이름과 날짜로 1건 이상 입력해주세요.");
      return;
    }
    setChecking(true);
    const data = await fetchSpraySequence({ inoculantName, inoculantType, inoculantDate, materials: valid });
    setChecking(false);
    onResult(data);
  }

  const TYPE_OPTS = [
    { id: "bacteria", label: "세균제" },
    { id: "fungus", label: "곰팡이제" },
    { id: "both", label: "잘 모름" },
  ];

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <TopBar title="살포 가능 확인" onBack={onBack} />
      <div className="flex-1 max-w-lg w-full mx-auto px-5 py-6">
        <Reveal>
          <h2 className="text-xl font-bold text-stone-900 mb-1">언제 미생물제를 뿌리면 안전할까요?</h2>
          <p className="text-sm text-stone-500 mb-6">
            최근에 뿌린 약제·비료와 날짜를 알려주시면, 미생물이 죽지 않는 안전한 살포 시기를 계산해드려요.
          </p>
        </Reveal>

        {/* 뿌릴 미생물제 */}
        <Reveal delay={60}>
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-3.5">
            <label className="block text-sm font-semibold text-stone-700 mb-2">뿌리려는 미생물 / 제품명</label>
            <input
              value={inoculantName}
              onChange={(e) => setInoculantName(e.target.value)}
              placeholder="예: 트리코더마, Bacillus subtilis, OO미생물제"
              className="w-full rounded-md border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-2 text-xs font-semibold text-stone-500 mb-1.5">이 미생물제는 어떤 종류인가요?</p>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setInoculantType(t.id)}
                  className={`rounded-md border-2 py-2 text-xs font-semibold transition-all ${
                    inoculantType === t.id
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800 -translate-y-0.5 shadow-sm"
                      : "border-stone-200 text-stone-600 hover:border-emerald-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-stone-400">
              학명(예: Trichoderma harzianum)을 입력하면 종류를 자동으로 판정합니다. 모르면 &apos;잘 모름&apos;을 고르면 더 안전하게(보수적으로) 계산해요.
            </p>
          </div>

          {/* 살포 예정일 */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-3.5">
            <label className="block text-sm font-semibold text-stone-700 mb-2">미생물제 살포 예정일</label>
            <input
              type="date"
              value={inoculantDate}
              onChange={(e) => setInoculantDate(e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </Reveal>

        {/* 최근 살포한 약제·비료 */}
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-stone-700">최근에 뿌린 약제·비료</label>
          <button onClick={addMaterial} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
            + 자재 추가
          </button>
        </div>
        {materials.map((m, i) => (
          <MaterialRow
            key={i}
            row={m}
            onChange={(next) => updateMaterial(i, next)}
            onRemove={() => removeMaterial(i)}
            canRemove={materials.length > 1}
          />
        ))}

        <button onClick={handleCheck} disabled={checking} className={`${PRIMARY_BTN} mt-3`}>
          {checking ? "계산 중..." : "안전 살포일 확인하기"}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   살포 확인 결과 화면 (별도 페이지)
────────────────────────────────────────────────────────────── */
export function CheckResultScreen({ result, onBack }) {
  if (!result) return null;

  if (result.error) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col">
        <TopBar title="살포 확인 결과" onBack={onBack} backLabel="홈" />
        <div className="flex-1 max-w-lg w-full mx-auto px-5 py-6">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 border-l-4 border-l-rose-500">
            <h4 className="font-bold text-stone-900 mb-1">확인하지 못했습니다</h4>
            <p className="text-sm text-stone-700 leading-relaxed">{result.error}</p>
          </div>
          <button onClick={onBack} className={`${SECONDARY_BTN} w-full py-3 mt-4`}>
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const safe = result.verdict === "safe";
  const g = result.governingMaterial;

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <TopBar title="살포 확인 결과" onBack={onBack} backLabel="홈" />
      <div className="flex-1 max-w-lg w-full mx-auto px-5 py-6">
        <Reveal>
          <div className="space-y-3">
            {/* 핵심 판정 */}
            <div className={`rounded-2xl p-5 ${safe ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-300"}`}>
              <div className="text-3xl mb-1">{safe ? "🟢" : "🟡"}</div>
              <h4 className={`font-bold mb-1 ${safe ? "text-emerald-800" : "text-amber-700"}`}>
                {safe ? "지금 살포해도 괜찮아요" : "조금 더 기다리는 게 좋아요"}
              </h4>
              <p className="text-sm text-stone-700 leading-relaxed">{result.headline}</p>
              {result.safeDate && (
                <p className="mt-2 text-sm font-semibold text-stone-800">📅 권장 살포 가능일: {result.safeDate}</p>
              )}
            </div>

            {/* 발목 잡는 자재 */}
            {g && (
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 text-sm">
                <p className="font-semibold text-stone-700 mb-1">가장 영향이 큰 자재</p>
                <p className="text-stone-700">
                  {g.risk} <strong>{g.name}</strong>
                  {g.family ? ` (${g.family})` : ""} — {g.appliedDate} 살포, 권장 간격 약 {g.term}일
                </p>
                {g.source && (
                  <a
                    href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${g.source}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-700 underline"
                  >
                    근거 논문 보기 ({g.source})
                  </a>
                )}
              </div>
            )}

            {/* 자재별 내역 */}
            {Array.isArray(result.perMaterial) && result.perMaterial.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
                <p className="text-xs font-bold text-stone-500 mb-2">자재별 안전 해제일</p>
                <div className="space-y-1.5">
                  {result.perMaterial.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-stone-700">
                        {m.risk} {m.name}
                        {m.family ? <span className="text-stone-400"> · {m.family}</span> : null}
                      </span>
                      <span className="text-stone-500">{m.clearDate} ({RISK_LABEL[m.risk] || ""}, {m.term}일)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 구리 누적 경고 */}
            {result.copperWarning?.flag && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700 leading-relaxed">
                ⚠️ {result.copperWarning.message}
              </div>
            )}

            {/* 미확인 자재 */}
            {Array.isArray(result.unmatchedMaterials) && result.unmatchedMaterials.length > 0 && (
              <div className="bg-stone-100 rounded-2xl p-4 text-xs text-stone-600 leading-relaxed">
                다음 자재는 정확한 분류를 찾지 못해 보수적으로(주의) 계산했어요: {result.unmatchedMaterials.join(", ")}.
                정식 상표명으로 다시 입력하면 더 정확해집니다.
              </div>
            )}

            {/* 기온 안내 + 주석 */}
            {result.tempAdvisory && (
              <p className="text-xs text-stone-500 leading-relaxed">🌡️ {result.tempAdvisory}</p>
            )}
            {result.note && <p className="text-[11px] text-stone-400 leading-relaxed">{result.note}</p>}

            {/* 로그인 상태면 살포 확인 결과를 내 기록에 저장 (로그인은 선택) */}
            <div className="pt-1">
              <SaveRecordButton
                build={() => ({
                  kind: "spray",
                  crop: "",
                  title: result.safeDate ? `살포 권장일 ${result.safeDate}` : "살포 확인 결과",
                  summary: result.headline || "",
                  payload: result,
                })}
              />
            </div>
          </div>
        </Reveal>

        <button onClick={onBack} className={`${SECONDARY_BTN} w-full py-3 mt-4`}>
          홈으로 돌아가기
        </button>
      </div>
    </div>
  );
}
