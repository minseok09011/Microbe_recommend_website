/* ============================================================
   🧪 더미(Mock) 백엔드 — 프론트엔드 개발/확인용
   ------------------------------------------------------------
   카카오 API 승인이나 백엔드 서버 없이도 Live Server에서 화면
   흐름을 끝까지 확인할 수 있도록, window.fetch 를 가로채
   가짜 데이터를 돌려줍니다. (추천 + 살포 시퀀스 모두 지원)

   ✅ 켜는 법: 아무 페이지나 주소 끝에 ?mock=1 을 한 번 붙이면
      그 세션 동안 계속 켜져 있습니다(페이지를 옮겨도 유지).
   ❌ 끄는 법: 주소 끝에 ?mock=0 (기본값 = 진짜 백엔드)

   ⚠️ 임시 확인용. 각 HTML의 <script src="js/mock.js"> 한 줄만
      빼면 완전히 제거됩니다.
   ============================================================ */
(function setupMockBackend() {
    const forced = new URLSearchParams(location.search).get("mock");
    // ?mock=1 → 세션 ON 저장 / ?mock=0 → 해제 / 그 외 → 세션 상태 따름
    let MOCK_ON;
    try {
        if (forced === "1") { sessionStorage.setItem("MOCK_ON", "1"); MOCK_ON = true; }
        else if (forced === "0") { sessionStorage.removeItem("MOCK_ON"); MOCK_ON = false; }
        else { MOCK_ON = sessionStorage.getItem("MOCK_ON") === "1"; }
    } catch (e) {
        MOCK_ON = forced === "1"; // sessionStorage 막힌 환경 폴백
    }
    if (!MOCK_ON) return;

    console.warn(
        "%c🧪 MOCK 모드 ON — 가짜 데이터로 화면을 보여주는 중입니다.\n" +
        "진짜 백엔드로 보려면 주소 끝에 ?mock=0 을 붙이세요.",
        "color:#16a34a;font-weight:bold;"
    );

    function jsonResponse(body) {
        return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }

    // ── 추천 플로우용 가짜 응답 ───────────────────────────────
    function mockKakaoAddress() {
        return jsonResponse({
            documents: [{ x: "126.9784147", y: "37.5666805", address: { b_code: "1111010100" } }],
        });
    }
    function mockMergedData() {
        return jsonResponse({
            isFarmland: true, soilPh: 6.4, soilOrganic: 25, soilPhosphate: 350,
            soilPotassium: 0.65, soilCalcium: 5.2, soilMagnesium: 1.8,
            soilMoisture: 22, airTemp: 18.5, rain: 0,
        });
    }
    function mockRecommend() {
        return jsonResponse({
            microbes: [
                {
                    species: "Bacillus subtilis",
                    vendorInfo: {
                        matchType: "species", matchedName: "Bacillus subtilis",
                        priceMin: 12000, priceMax: 38000, productCount: 7, registered: true,
                        vendors: [
                            { company: "(주)그린바이오", products: [
                                { product: "바실러스 토양활력제", price: "15,000원", contact: "061-123-4567", onlineUrl: "https://example.com/product/1" },
                                { product: "바실러스 액상 2종" }] },
                            { company: "흙살림영농조합", products: [
                                { product: "토양미생물 바실러스", price: "12,000원", contact: "063-987-6543" }] },
                        ],
                    },
                },
                {
                    species: "Trichoderma harzianum",
                    vendorInfo: {
                        matchType: "genus", matchedName: "Trichoderma",
                        priceMin: 18000, priceMax: 45000, productCount: 3, registered: false,
                        vendors: [{ company: "내추럴팜", products: [
                            { product: "트리코더마 친환경 제제", price: "22,000원", onlineUrl: "https://example.com/product/2" }] }],
                    },
                },
                { species: "Pseudomonas fluorescens", vendorInfo: null },
            ],
            explanation: "입력하신 밭은 pH 6.4의 약산성 토양에 유기물·유효인산이 충분한 편입니다. " +
                "이런 환경에서는 토양 정착력이 좋은 Bacillus subtilis가 뿌리 주변에 자리잡아 " +
                "병원균을 억제하고 양분 흡수를 도와줍니다. (※ 지금은 더미 데이터 화면입니다.)",
            scientificEvidence: "Bacillus subtilis는 항균물질(iturin, surfactin)을 분비해 토양 병원성 진균을 억제한다는 보고가 다수 있습니다.",
            sources: [
                { title: "Biocontrol potential of Bacillus subtilis in tomato rhizosphere", journal: "Plant and Soil", year: 2021 },
                { title: "Trichoderma as a biological control agent", journal: "Frontiers in Microbiology", year: 2020 },
            ],
            quotaExceeded: false,
        });
    }

    // ── 살포 시퀀스용 가짜 위험표 (실제 CSV에서 가져온 일부 제품) ──
    const MOCK_MATERIALS = [
        // pesticide: [상표명, 세균제위험, 곰팡이제위험, 계열]
        ["코사이드", "🔴", "🔴", "동제(구리)", "pesticide"],
        ["오티바", "🟢", "🔴", "스트로빌루린(QoI)", "pesticide"],
        ["가가방", "🟡", "🔴", "디티오카바메이트", "pesticide"],
        ["가드너", "🟡", "🔴", "스트로빌루린(QoI)", "pesticide"],
        ["가드랑", "🔴", "🟡", "항생제계(세균표적)", "pesticide"],
        ["가디온", "🟡", "🔴", "SDHI", "pesticide"],
        ["안트라콜", "🟡", "🔴", "디티오카바메이트", "pesticide"],
        ["다트롤", "🟢", "🟢", "살충제(비표적)", "pesticide"],
        ["메디충", "🟢", "🟢", "살충제(비표적)", "pesticide"],
        ["가드키", "🟢", "🟢", "살충제(비표적)", "pesticide"],
        // eco
        ["가비온보르도(보르도액)", "🔴", "🔴", "보르도·동제(구리)", "eco"],
        ["BK보르도606(보르도액)", "🔴", "🔴", "보르도·동제(구리)", "eco"],
        ["S석회유황합제(석회유황합제)", "🟡", "🔴", "석회유황합제", "eco"],
    ];
    const MAT_BY_NAME = {};
    for (const [name, b, f, family, type] of MOCK_MATERIALS) {
        MAT_BY_NAME[name.toLowerCase()] = { name, b, f, family, type };
    }
    // 비료·소독제 종류룰 (spray_sequence.js TYPE_RULES 동기화 사본)
    const TYPE_RULES = {
        fert_nitrogen: { b: "🟡", f: "🟡", family: "질소·칼리·복합비료" },
        fert_lime: { b: "🟡", f: "🟡", family: "석회·규산·고토" },
        fert_rawmanure: { b: "🟡", f: "🟡", family: "미부숙 가축분" },
        fert_compost: { b: "🟢", f: "🟢", family: "완숙퇴비·유기질·미생물" },
        fert_nutrient: { b: "🟢", f: "🟢", family: "영양제·미량요소" },
        fert_cyanamide: { b: "🔴", f: "🔴", family: "석회질소(예외)" },
        disinf_oxidizer: { b: "🔴", f: "🔴", family: "산화제계(과산화수소·과산화초산)" },
        disinf_chlorine: { b: "🔴", f: "🔴", family: "염소계(차아염소산·이산화염소)" },
        microbe: { b: "🟢", f: "🟢", family: "미생물 약제" },
        none: { b: "🟢", f: "🟢", family: "없음" },
    };

    // 엔진(spray_sequence.js) 이식 — 날짜 산식 동일
    const TERM_DAYS = { "🔴": 14, "🟡": 7, "🟢": 0 };
    const RISK_RANK = { "🔴": 3, "🟡": 2, "🟢": 1 };
    const BACT = ["bacillus", "paenibacillus", "pseudomonas", "lactobacillus", "lactiplantibacillus", "priestia", "streptomyces", "azospirillum", "rhizobium", "bradyrhizobium", "burkholderia", "serratia", "lysobacter", "azotobacter"];
    const FUNG = ["trichoderma", "beauveria", "metarhizium", "glomus", "funneliformis", "rhizophagus", "paecilomyces", "purpureocillium", "aspergillus", "penicillium", "clonostachys", "lecanicillium"];
    const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const daysBetween = (d1, d2) => Math.round((new Date(d2) - new Date(d1)) / 86400000);
    function classifySpecies(sp) {
        const g = (sp || "").trim().toLowerCase().split(/\s+/)[0];
        if (BACT.includes(g)) return "bacteria";
        if (FUNG.includes(g)) return "fungus";
        return "both";
    }

    function mockSprayMaterials(url) {
        const q = (new URL(url, location.origin).searchParams.get("q") || "").trim().toLowerCase();
        const limit = parseInt(new URL(url, location.origin).searchParams.get("limit"), 10) || 10;
        if (!q) return jsonResponse([]);
        const starts = [], contains = [];
        for (const m of MOCK_MATERIALS) {
            const idx = m[0].toLowerCase().indexOf(q);
            if (idx === 0) starts.push(m);
            else if (idx > 0) contains.push(m);
        }
        const out = starts.concat(contains).slice(0, limit)
            .map((m) => ({ name: m[0], type: m[4], family: m[3] }));
        return jsonResponse(out);
    }

    function mockSpraySequence(init) {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch (e) { body = {}; }
        const input = Array.isArray(body.materials) ? body.materials : [];

        let inoculantType = body.inoculantType;
        if (body.inoculantSpecies && body.inoculantSpecies.trim()) inoculantType = classifySpecies(body.inoculantSpecies);
        if (!["bacteria", "fungus", "both"].includes(inoculantType)) inoculantType = "both";

        const unmatched = [];
        const materials = input
            .filter((m) => m && (m.name || "").trim() && (m.appliedDate || "").trim())
            .map((m) => {
                const name = m.name.trim();
                let r = null;
                if (m.kind === "type") r = TYPE_RULES[name] || null;
                else r = MAT_BY_NAME[name.toLowerCase()] || TYPE_RULES[name] || null;
                if (!r) { unmatched.push(name); r = { b: "🟡", f: "🟡", family: "미확인" }; }
                return { name, appliedDate: m.appliedDate.trim(), bacteriaRisk: r.b, fungusRisk: r.f, family: r.family, source: null };
            });

        if (!materials.length) return new Response(JSON.stringify({ error: "자재를 1건 이상 입력해주세요." }), { status: 400, headers: { "Content-Type": "application/json" } });

        const pickRisk = (m) => {
            if (inoculantType === "bacteria") return m.bacteriaRisk;
            if (inoculantType === "fungus") return m.fungusRisk;
            return RISK_RANK[m.fungusRisk] >= RISK_RANK[m.bacteriaRisk] ? m.fungusRisk : m.bacteriaRisk;
        };
        const today = new Date().toISOString().slice(0, 10);
        const inoculantDate = (body.inoculantDate || "").trim() || today;

        const evaluated = materials.map((m) => {
            const risk = pickRisk(m);
            const term = TERM_DAYS[risk];
            return { ...m, risk, term, clearDate: addDays(m.appliedDate, term) };
        });
        const governing = evaluated.reduce((a, e) => (e.clearDate > a.clearDate ? e : a), evaluated[0]);
        const safeDate = governing.clearDate;

        const copperHits = evaluated.filter((e) => /구리|동제|보르도|석회유황/.test(e.family || ""));
        const copperWarning = copperHits.length >= 3
            ? { flag: true, count: copperHits.length, message: `구리·황 계열을 이번 시즌 ${copperHits.length}회 살포했습니다. 구리는 분해되지 않고 토양에 누적되므로, 권장 간격을 지켜도 잔류가 쌓입니다. 살포 횟수를 줄이거나 충분히 여유를 두세요.` }
            : { flag: false };

        const gap = daysBetween(inoculantDate, safeDate);
        const verdict = gap <= 0 ? "safe" : "wait";
        const headline = gap <= 0
            ? `${inoculantDate} 살포 가능 — 권장 간격을 충족합니다.`
            : `아직 이릅니다. ${safeDate} 이후(약 ${gap}일 더) 살포를 권장합니다. 길수록 안전합니다.`;

        const result = {
            verdict, headline, safeDate,
            tempAdvisory: null, // mock은 기온 데이터 없음
            governingMaterial: { name: governing.name, family: governing.family, risk: governing.risk, term: governing.term, appliedDate: governing.appliedDate, source: null },
            perMaterial: evaluated.map((e) => ({ name: e.name, family: e.family, risk: e.risk, term: e.term, appliedDate: e.appliedDate, clearDate: e.clearDate })),
            copperWarning,
            note: "표시된 간격은 '최소 권장값'이며 밭 조건(저온·건조·척박)에 따라 더 길어질 수 있습니다.",
            inoculantType,
        };
        if (unmatched.length) result.unmatchedMaterials = unmatched;
        return jsonResponse(result);
    }

    // ── fetch 가로채기 ───────────────────────────────────────
    const realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        const url = typeof input === "string" ? input : (input && input.url) || "";

        if (url.includes("dapi.kakao.com")) { console.log("🧪 [mock] 카카오 주소검색"); return Promise.resolve(mockKakaoAddress()); }
        if (url.includes("/api/getMergedData")) { console.log("🧪 [mock] getMergedData"); return Promise.resolve(mockMergedData()); }
        if (url.includes("/api/recommendMicrobe")) { console.log("🧪 [mock] recommendMicrobe"); return Promise.resolve(mockRecommend()); }
        if (url.includes("/api/sprayMaterials")) { console.log("🧪 [mock] sprayMaterials"); return Promise.resolve(mockSprayMaterials(url)); }
        if (url.includes("/api/spraySequence")) { console.log("🧪 [mock] spraySequence"); return Promise.resolve(mockSpraySequence(init)); }

        return realFetch(input, init);
    };
})();
