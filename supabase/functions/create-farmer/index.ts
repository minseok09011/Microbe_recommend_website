// ============================================================
// Edge Function: create-farmer
// ------------------------------------------------------------
// 관리자만 농민 계정을 만들 수 있게 하는 서버 함수.
// - 호출자의 JWT(Authorization 헤더)로 "정말 admin인지" 먼저 확인
// - 확인되면 SERVICE ROLE 키로 Auth 유저 생성 + farmers 행 삽입
//   (farmers.id = 생성된 Auth 유저의 id 로 매핑 → RLS의 auth.uid()와 일치)
// ⚠️ SERVICE_ROLE 키는 이 함수(서버) 안에서만 쓰이고 클라이언트에 절대 안 나감.
//
// 배포: supabase functions deploy create-farmer
// 필요한 시크릿(대부분 자동 주입): SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST만 허용됩니다." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return json({ error: "로그인이 필요합니다." }, 401);

  // 1) 호출자 신원 확인 (호출자의 JWT로 동작하는 클라이언트)
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "세션이 유효하지 않습니다." }, 401);

  // 2) 호출자가 admin인지 farmers 테이블로 확인
  const { data: me, error: meErr } = await caller
    .from("farmers")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (meErr) return json({ error: "권한 확인 실패: " + meErr.message }, 500);
  if (!me || me.role !== "admin") return json({ error: "관리자만 계정을 만들 수 있습니다." }, 403);

  // 3) 입력 검증
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "요청 형식 오류" }, 400); }
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = body.role === "admin" ? "admin" : "farmer";
  if (!username || !password) return json({ error: "아이디와 비밀번호는 필수입니다." }, 400);
  if (password.length < 6) return json({ error: "비밀번호는 6자 이상이어야 합니다." }, 400);

  const email = `${username}@farm.local`;

  // 4) SERVICE ROLE로 유저 생성 (이메일 확인 불필요로 바로 사용 가능)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    return json({ error: "계정 생성 실패: " + (createErr?.message || "알 수 없음") }, 400);
  }

  // 5) farmers 프로필 행 삽입 (id = 새 Auth 유저 id)
  const { error: insErr } = await admin.from("farmers").insert({
    id: created.user.id,
    username,
    name: body.name ?? null,
    phone: body.phone ?? null,
    region: body.region ?? null,
    role,
  });
  if (insErr) {
    // 프로필 삽입 실패 시 방금 만든 Auth 유저를 롤백(고아 계정 방지)
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "프로필 저장 실패(계정 롤백됨): " + insErr.message }, 400);
  }

  return json({ ok: true, id: created.user.id, username, role });
});
