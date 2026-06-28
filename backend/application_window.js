/* ============================================================
   미생물 "적용 적합일" 판정 — 균종(세균/곰팡이) 인지 + 살포 안전일과 교집합.
   ⚠️ 타이밍 전용. 종 선택·화학 살포간격은 절대 바꾸지 않는다.
   입력 forecast: weather_forecast.fetchVilageForecast()의 일별 집계 배열.
   ============================================================ */

const WINDOW_THRESHOLDS = {
  rainPopHigh: 60, // 강수확률(%) 이 이상이면 감점
  rainPcpHeavyMm: 5, // 적용일 시간당 PCP 이 이상이면 부적합(washout)
  tempMin: 5, // 일최저 이 이하면 부적합(서리/저온)
  tempMax: 35, // 일최고 이 이상이면 부적합(고온)
  tempGoodMin: 15, // 활성 적온대(가점) 하한
  tempGoodMax: 30, // 활성 적온대(가점) 상한
  rehGoodFungus: 50, // 곰팡이제: 평균습도 이 이상이면 가점
};

// "YYYYMMDD" → "YYYY-MM-DD"
function isoDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// 하루 적합도 판정. inoculantType: "bacteria" | "fungus" | "both"
function scoreDay(day, inoculantType = "both", th = WINDOW_THRESHOLDS) {
  const reasons = [];
  let bad = false;
  let warn = false;
  let timeOfDay;

  // ── 공통: 강수(유실) ──
  if (day.maxPcpMm >= th.rainPcpHeavyMm || day.anyHeavyRain) {
    bad = true;
    reasons.push("강한 비로 약제 유실 우려");
  } else if (day.maxPop > th.rainPopHigh) {
    warn = true;
    reasons.push(`강수확률 높음(${day.maxPop}%)`);
  }

  // ── 공통: 기온(서리/고온) ──
  if (day.tmn != null && day.tmn <= th.tempMin) {
    bad = true;
    reasons.push(`저온·서리 위험(최저 ${day.tmn}℃)`);
  }
  if (day.tmx != null && day.tmx >= th.tempMax) {
    bad = true;
    reasons.push(`고온(최고 ${day.tmx}℃)`);
  }
  const inGoodTemp =
    day.tmn != null && day.tmx != null && day.tmn >= th.tempGoodMin - 5 && day.tmx <= th.tempGoodMax;
  if (inGoodTemp) reasons.push("기온이 미생물 활성에 적당함");

  // ── 균종별 ──
  const isFungus = inoculantType === "fungus" || inoculantType === "both";
  const isBacteria = inoculantType === "bacteria" || inoculantType === "both";
  let fungusFavorable = true;

  if (isFungus) {
    const cloudy = day.skyWorst === 3 || day.skyWorst === 4;
    const humid = day.avgReh != null && day.avgReh >= th.rehGoodFungus;
    const clearDry = day.skyWorst === 1 && day.avgReh != null && day.avgReh < th.rehGoodFungus;
    if (cloudy) reasons.push("흐림/구름으로 자외선·건조 부담이 적어 곰팡이제에 유리");
    if (humid) reasons.push(`습도 충분(${day.avgReh}%)`);
    if (clearDry) {
      warn = true;
      fungusFavorable = false;
      timeOfDay = "저녁";
      reasons.push("맑고 건조 — 자외선·건조 피해 저녁 살포 권장");
    }
  }

  // ── 종합 ──
  // ok: 부적합 신호(washout/서리/고온)가 없으면 적용 가능.
  // both는 보수적: 곰팡이 불리(맑고 건조) 신호가 있으면 warn으로만 두되 level은 낮춘다.
  const ok = !bad;
  let level;
  if (bad) level = "bad";
  else if (warn || !inGoodTemp) level = "ok";
  else if (inGoodTemp && !(isFungus && !fungusFavorable)) level = "good";
  else level = "ok";

  return { ok, level, reasons, timeOfDay };
}

// safeDate(YYYY-MM-DD) 이상이면서 적용 가능한 가장 이른 날을 고른다.
function bestApplyDay(forecast, safeDate, inoculantType = "both", th = WINDOW_THRESHOLDS) {
  const safeIso = safeDate || isoDate(forecast?.[0]?.date) || "";

  const perDay = (forecast || []).map((d) => {
    const s = scoreDay(d, inoculantType, th);
    return { date: isoDate(d.date), level: s.level, ok: s.ok, reasons: s.reasons, timeOfDay: s.timeOfDay };
  });

  // safeDate 이상 + ok 인 가장 이른 날
  const eligible = perDay.filter((d) => d.date >= safeIso && d.ok);
  const pick = eligible[0] || null;

  let reasonNoDay = null;
  if (!pick) {
    const afterSafe = perDay.filter((d) => d.date >= safeIso);
    reasonNoDay =
      afterSafe.length === 0
        ? "예보 범위(~3일) 안에 살포 안전일 이후 날짜가 없어요. 안전일 이후 날씨를 다시 확인해주세요."
        : "예보 범위(~3일) 안에는 날씨 조건이 맞는 적용일이 없어요. 비·기온이 안정된 뒤 다시 확인해주세요.";
  }

  return {
    recommendDate: pick ? pick.date : null,
    timeOfDay: pick ? pick.timeOfDay || null : null,
    perDay,
    safeDate: safeIso,
    horizonDays: perDay.length,
    reason: reasonNoDay,
  };
}

module.exports = { scoreDay, bestApplyDay, WINDOW_THRESHOLDS };
