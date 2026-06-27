/* ============================================================
   공통 인증 헬퍼 (Supabase Auth)
   ------------------------------------------------------------
   - username 을 "username@farm.local" 가짜 이메일로 바꿔 로그인
   - 보호 페이지 상단에서 requireAuth()/requireAdmin() 호출
   의존: supabaseClient (js/supabaseClient.js)
   ============================================================ */
const FARM_EMAIL_DOMAIN = "@farm.local";

function usernameToEmail(username) {
    return String(username || "").trim().toLowerCase() + FARM_EMAIL_DOMAIN;
}
function emailToUsername(email) {
    return String(email || "").replace(FARM_EMAIL_DOMAIN, "");
}
function ensureSupabase() {
    if (!supabaseClient) {
        throw new Error("로그인 기능이 아직 설정되지 않았습니다. (js/supabaseConfig.js 를 채워주세요)");
    }
}

// 아이디/비번 로그인. 성공 시 세션 생성, 실패 시 throw.
async function login(username, password) {
    ensureSupabase();
    const email = usernameToEmail(username);
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

// 로그아웃 후 로그인 페이지로
async function logout() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    window.location.href = "login.html";
}

async function getSession() {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data.session || null;
}

// 현재 로그인한 농민 정보(farmers 테이블 + role). 프로필 행이 없으면 세션 기반 최소 정보 반환.
async function getCurrentFarmer() {
    const session = await getSession();
    if (!session) return null;
    const uid = session.user.id;
    const fallbackUsername = emailToUsername(session.user.email);

    const { data, error } = await supabaseClient
        .from("farmers")
        .select("id, username, name, phone, region, role")
        .eq("id", uid)
        .maybeSingle();

    if (error || !data) {
        // farmers 행이 아직 없을 때도 화면이 깨지지 않도록 안전한 기본값
        return { id: uid, username: fallbackUsername, name: fallbackUsername, phone: null, region: null, role: "farmer", _missingProfile: true };
    }
    return data;
}

// 세션 없으면 로그인 페이지로 보냄. 보호 페이지 최상단에서 await 로 호출.
async function requireAuth() {
    const session = await getSession();
    if (!session) {
        window.location.replace("login.html");
        return null;
    }
    return session;
}

// 관리자 전용 페이지 보호
async function requireAdmin() {
    const session = await getSession();
    if (!session) {
        window.location.replace("login.html");
        return null;
    }
    const farmer = await getCurrentFarmer();
    if (!farmer || farmer.role !== "admin") {
        alert("관리자만 들어갈 수 있는 화면입니다.");
        window.location.replace("dashboard.html");
        return null;
    }
    return farmer;
}
