/* ============================================================
   우리밭 미생물 도우미 — 공통 스크립트
   모든 페이지가 이 파일을 공유합니다.

   ⚠️ 결과 화면의 데이터는 지금 "임시(가짜)"입니다.
      나중에 친구(백엔드) API가 준비되면, 표시된 fetch 자리에서
      실제 데이터를 받아오도록 바꾸면 됩니다.
   ============================================================ */

/* ------------------------------------------------------------
   1. 홈 화면 — 버튼 → 페이지 이동
   ------------------------------------------------------------ */
function goRecommend() {
    window.location.href = "a_recommend.html";   // a: 추천 입력
}

function goSpray() {
    window.location.href = "b_spray.html";        // b: 살포 입력
}

/* ------------------------------------------------------------
   2. a: 추천 입력 → 저장 후 결과로 이동
   ------------------------------------------------------------ */
function submitRecommend() {
    const sido = document.getElementById("sido").value;
    const sigungu = document.getElementById("sigungu").value;
    const crop = document.getElementById("crop").value;
    const need = document.getElementById("need").value;

    if (!sido || !sigungu) {
        alert("농사 짓는 곳을 시·도부터 골라 주세요!");
        return;
    }

    // 회원가입 없이 → 브라우저에 임시 저장 (다음 페이지로 전달)
    localStorage.setItem("userLocation", sido + " " + sigungu);
    localStorage.setItem("userCrop", crop);
    localStorage.setItem("userNeed", need);

    window.location.href = "a-1_recommend-result.html";   // a-1: 추천 결과
}

/* 시·도를 고르면 → 그에 맞는 시·군·구 목록을 채웁니다 (연동 드롭다운) */
function initRegionSelect() {
    const sidoSel = document.getElementById("sido");
    const sigunguSel = document.getElementById("sigungu");
    if (!sidoSel || !sigunguSel || typeof REGIONS === "undefined") return;

    // 시·도 채우기
    sidoSel.innerHTML = '<option value="">시·도를 고르세요</option>' +
        Object.keys(REGIONS).map(s => `<option value="${s}">${s}</option>`).join("");

    // 시·도 선택 시 시·군·구 채우기
    sidoSel.addEventListener("change", function () {
        const list = REGIONS[this.value] || [];
        sigunguSel.disabled = list.length === 0;
        sigunguSel.innerHTML = list.length
            ? '<option value="">시·군·구를 고르세요</option>' +
              list.map(g => `<option value="${g}">${g}</option>`).join("")
            : '<option value="">먼저 시·도를 고르세요</option>';
    });
}

/* ------------------------------------------------------------
   3. b: 살포 입력 → 저장 후 결과로 이동
   ------------------------------------------------------------ */
function submitSpray() {
    const last = document.getElementById("sprayLast").value;
    const lastDate = document.getElementById("sprayLastDate").value;
    const next = document.getElementById("sprayNext").value;

    if (!lastDate) {
        alert("언제 뿌렸는지 날짜를 골라 주세요!");
        return;
    }

    localStorage.setItem("sprayLast", last);
    localStorage.setItem("sprayLastDate", lastDate);
    localStorage.setItem("sprayNext", next);

    window.location.href = "b-1_spray-result.html";        // b-1: 살포 결과
}

/* ============================================================
   결과 화면 렌더링 (페이지 로드 시 자동 실행)
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("sido")) initRegionSelect();
    if (document.getElementById("recommendResult")) renderRecommendResult();
    if (document.getElementById("sprayResult")) renderSprayResult();
});

/* ------------------------------------------------------------
   한글 라벨 (저장된 코드값 → 농민 언어)
   ------------------------------------------------------------ */
const CROP_LABEL = { tomato: "🍅 토마토", pepper: "🌶️ 고추", cucumber: "🥒 오이" };
const NEED_LABEL = { disease: "병 막기", growth: "잘 자라게 하기" };
const SPRAY_LABEL = {
    chemical: "농약",
    microbe: "미생물 약제",
    nutrient: "영양제(비료)",
    none: "아무것도 안 뿌림"
};

/* ------------------------------------------------------------
   a-1: 추천 결과 — /api/recommendMicrobe(RAG+LLM) 호출 결과 표시
   a_recommend.html에서 모아둔 토양·기상 데이터(localStorage)를
   바탕으로 백엔드에 추천을 요청합니다.
   ------------------------------------------------------------ */
const RECOMMEND_BACKEND_BASE_URL = "https://microbe-recommend-website.onrender.com";

async function renderRecommendResult() {
    const crop = localStorage.getItem("userCrop") || "tomato";
    const address = localStorage.getItem("userAddress") || "";
    const envRaw = localStorage.getItem("integratedSoilEnvironment");

    const summary = document.getElementById("summary");
    const resultEl = document.getElementById("recommendResult");

    if (summary) {
        summary.innerHTML =
            `<span class="summary__chip">${CROP_LABEL[crop] || crop}</span>` +
            (address ? `<span class="summary__chip">📍 ${address}</span>` : "");
    }

    if (!envRaw) {
        resultEl.innerHTML = `<p class="notice">먼저 <a href="a_recommend.html">농경지 정보를 입력</a>해주세요.</p>`;
        return;
    }

    const env = JSON.parse(envRaw);
    resultEl.innerHTML = `<p class="notice">🔬 우리 밭 데이터에 맞는 미생물을 분석하는 중입니다...</p>`;

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

    try {
        const res = await fetch(`${RECOMMEND_BACKEND_BASE_URL}/api/recommendMicrobe?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "추천 요청 중 오류가 발생했습니다.");

        const cards = data.microbes.map((m) => {
            const v = m.vendorInfo;
            return `
                <div class="result-card">
                    <span class="result-card__badge">👍 추천 미생물</span>
                    <h2 class="result-card__name">${m.species}</h2>
                    ${v ? `
                        <div class="result-card__row">
                            <span class="label">가격대</span>
                            <span class="value">${v.priceMin ? v.priceMin.toLocaleString() + "원 ~ " + v.priceMax.toLocaleString() + "원" : "정보 없음"}</span>
                        </div>
                        <div class="result-card__row">
                            <span class="label">등록 제품 수</span>
                            <span class="value">${v.productCount}개</span>
                        </div>
                        <div class="result-card__row">
                            <span class="label">식약처 등록</span>
                            <span class="value">${v.mfdsRegistered ? "등록됨" : "미등록"}</span>
                        </div>
                    ` : `<p class="result-card__effect">판매처 정보가 아직 등록되지 않은 균종입니다.</p>`}
                </div>
            `;
        }).join("");

        const sourcesList = data.sources.map((s) =>
            `<li>${s.title} <span class="value">(${s.journal}, ${s.year})</span></li>`
        ).join("");

        resultEl.innerHTML = `
            ${cards}
            <p class="result-card__effect">${data.explanation}</p>
            ${data.quotaExceeded ? `<p class="notice">⚠️ AI 무료 사용량 한도에 도달해 추천 균종 목록은 비어 있습니다. 잠시 후 다시 시도해주세요.</p>` : ""}
            <details class="notice">
                <summary>참고 논문 ${data.sources.length}건 보기</summary>
                <ul>${sourcesList}</ul>
            </details>
        `;
    } catch (error) {
        console.error(error);
        resultEl.innerHTML = `<p class="notice">⚠️ ${error.message}</p>`;
    }
}

/* ------------------------------------------------------------
   b-1: 살포 결과 — 임시 규칙으로 신호등 표시
   ※ 실제로는 백엔드가 날씨·약제 간격을 보고 판단해 줍니다.
   ------------------------------------------------------------ */
function renderSprayResult() {
    const last = localStorage.getItem("sprayLast") || "none";
    const lastDateStr = localStorage.getItem("sprayLastDate");
    const next = localStorage.getItem("sprayNext") || "microbe";

    // ── 임시 규칙: 마지막 살포일 + 7일 후부터 가능 ──
    //    (실제 간격/날씨 판단은 백엔드가 계산)
    const WAIT_DAYS = 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDate = lastDateStr ? new Date(lastDateStr) : today;
    const canDate = new Date(lastDate);
    canDate.setDate(canDate.getDate() + WAIT_DAYS);

    const dayMs = 1000 * 60 * 60 * 24;
    const daysLeft = Math.ceil((canDate - today) / dayMs);

    // 신호등 판정
    let cls, emoji, headline, dateLine;
    const canDateText = `${canDate.getMonth() + 1}월 ${canDate.getDate()}일`;

    if (daysLeft <= 0) {
        cls = "signal--go"; emoji = "🟢";
        headline = "오늘 뿌려도 괜찮아요";
        dateLine = "지금 살포할 수 있어요";
    } else if (daysLeft <= 2) {
        cls = "signal--warn"; emoji = "🟡";
        headline = "조금만 기다리세요";
        dateLine = `${canDateText}부터 뿌릴 수 있어요`;
    } else {
        cls = "signal--stop"; emoji = "⛔";
        headline = "아직 뿌리면 안 돼요";
        dateLine = `${canDateText}부터 뿌릴 수 있어요`;
    }

    // 요약 칩
    const summary = document.getElementById("summary");
    if (summary) {
        summary.innerHTML =
            `<span class="summary__chip">최근: ${SPRAY_LABEL[last] || last}</span>` +
            `<span class="summary__chip">뿌릴 것: ${SPRAY_LABEL[next] || next}</span>`;
    }

    document.getElementById("sprayResult").innerHTML = `
        <div class="signal ${cls}">
            <div class="signal__light">${emoji}</div>
            <h2 class="signal__headline">${headline}</h2>
            <p class="signal__date">📅 ${dateLine}</p>
            <p class="signal__sub">
                마지막으로 ${SPRAY_LABEL[last] || last}을(를) 뿌린 뒤
                약 ${WAIT_DAYS}일 정도 간격을 두는 게 좋아요.
            </p>
        </div>
        <p class="notice">
            ※ 지금은 <b>예시</b>예요. 곧 우리 동네 날씨(비·바람)까지 보고
            정확한 날짜를 알려 드립니다.
        </p>
    `;
}
