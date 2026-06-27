/* ============================================================
   관리자 기능 — 농민 계정 생성 / 농민 목록
   ------------------------------------------------------------
   계정 생성은 Supabase Auth admin API가 필요하고, 그건 secret 키로만
   가능하므로 프론트에서 직접 못 한다. 대신 Edge Function('create-farmer')을
   호출한다. secret 키는 함수 안(서버)에만 있고 클라이언트엔 절대 노출 안 됨.

   호출 시 현재 로그인된 관리자의 JWT가 자동으로 함수에 전달되고,
   함수가 "호출자가 admin인지" 다시 확인한 뒤에만 계정을 만든다.
   의존: supabaseClient (js/supabaseClient.js)
   ============================================================ */

// 농민 계정 생성 (Edge Function 경유)
async function createFarmerAccount({ username, password, name, phone, region, role }) {
    ensureSupabase();
    const { data, error } = await supabaseClient.functions.invoke("create-farmer", {
        body: {
            username: String(username || "").trim().toLowerCase(),
            password: password,
            name: name || null,
            phone: phone || null,
            region: region || null,
            role: role === "admin" ? "admin" : "farmer",
        },
    });
    if (error) {
        // 함수가 4xx를 주면 error.context로 본문을 읽을 수 있음
        let msg = error.message || "계정 생성에 실패했습니다.";
        try {
            if (error.context && typeof error.context.json === "function") {
                const body = await error.context.json();
                if (body && body.error) msg = body.error;
            }
        } catch (e) { /* noop */ }
        throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
}

// 농민 목록 (RLS: admin만 전체 조회 가능)
async function listFarmers() {
    ensureSupabase();
    const { data, error } = await supabaseClient
        .from("farmers")
        .select("id, username, name, phone, region, role, created_at")
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}
