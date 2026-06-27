/* ============================================================
   Supabase 클라이언트 생성 (CDN UMD 전역 window.supabase 사용)
   ------------------------------------------------------------
   로드 순서: supabase-js(CDN) → supabaseConfig.js → 이 파일
   설정(URL/키)이 비어 있으면 supabaseClient = null 로 두어,
   로그인/기록 기능만 비활성화되고 추천·시퀀스 화면은 그대로
   동작하도록 한다(설정 전에도 페이지가 깨지지 않게).
   ============================================================ */
let supabaseClient = null;

(function initSupabaseClient() {
    const hasLib = typeof window !== "undefined" && window.supabase && typeof window.supabase.createClient === "function";
    const hasConfig =
        typeof SUPABASE_URL === "string" && SUPABASE_URL.trim() &&
        typeof SUPABASE_PUBLISHABLE_KEY === "string" && SUPABASE_PUBLISHABLE_KEY.trim();

    if (!hasLib) {
        console.warn("⚠️ supabase-js 라이브러리가 로드되지 않았습니다(CDN <script> 확인).");
        return;
    }
    if (!hasConfig) {
        console.warn("⚠️ js/supabaseConfig.js 의 URL/publishable 키가 비어 있어 로그인·기록 기능이 비활성화됩니다.");
        return;
    }
    // publishable 키를 그대로 두 번째 인자로 전달(새 키 시스템에서도 동일하게 동작)
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
})();

// 설정이 안 됐을 때 사용자에게 안내하기 위한 헬퍼
function isSupabaseReady() {
    return !!supabaseClient;
}
