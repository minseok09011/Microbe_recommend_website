/* ============================================================
   "내 기록에 저장" 버튼 — 추천/시퀀스 결과 화면에 얹기
   ------------------------------------------------------------
   추천·시퀀스 코드(app.js)는 건드리지 않는다. 이 스크립트만
   추가로 로드되어, 로그인 상태일 때만 결과 화면 하단에 버튼을
   끼워 넣는다. 누르면 결과 맥락을 record-form.html 로 넘겨
   사용자가 확인 후 저장하게 한다.
   의존: supabaseClient, getCurrentFarmer (auth.js)
   ============================================================ */
(function setupSaveRecordButton() {
    document.addEventListener("DOMContentLoaded", async function () {
        if (typeof supabaseClient === "undefined" || !supabaseClient) return; // Supabase 미설정이면 아무것도 안 함
        let farmer = null;
        try { farmer = await getCurrentFarmer(); } catch (e) { return; }
        if (!farmer) return;                          // 비로그인 → 버튼 없음

        const isRecommend = !!document.getElementById("recommendResult");
        const isSpray = !!document.getElementById("sprayResult");
        if (!isRecommend && !isSpray) return;

        const actions = document.querySelector(".actions") || document.querySelector("main.container");
        if (!actions) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn--primary";
        btn.textContent = "📝 내 기록에 저장하기";
        btn.style.marginTop = "12px";
        actions.insertBefore(btn, actions.firstChild);

        btn.addEventListener("click", function () {
            const today = new Date().toISOString().slice(0, 10);
            let prefill;
            if (isRecommend) {
                const topName = (document.querySelector(".result-card__name") || {}).textContent || "";
                prefill = {
                    record_date: today,
                    crop_name: localStorage.getItem("userCrop") || "",
                    work_type: "미생물",
                    memo: ("추천 미생물: " + topName).trim(),
                    note: localStorage.getItem("userAddress") || "",
                };
            } else {
                const dateLine = (document.querySelector(".signal__date") || {}).textContent || "";
                const gov = (document.querySelector(".result-card__name") || {}).textContent || "";
                prefill = {
                    record_date: today,
                    crop_name: "",
                    work_type: "미생물",
                    memo: ("살포 시퀀스 결과 — " + dateLine).trim(),
                    note: gov ? ("발목 잡는 자재: " + gov.trim()) : "",
                };
            }
            try { sessionStorage.setItem("recordPrefill", JSON.stringify(prefill)); } catch (e) { /* noop */ }
            window.location.href = "record-form.html?prefill=1";
        });
    });
})();
