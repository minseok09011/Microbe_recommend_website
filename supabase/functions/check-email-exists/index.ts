// ============================================================
// Edge Function: check-email-exists
// ------------------------------------------------------------
// 비밀번호 찾기 화면에서, 입력한 이메일이 실제로 가입돼 있는지
// 확인하기 위한 서버 함수.
// - SERVICE ROLE 키로만 가입 여부를 알 수 있어서(클라이언트 anon 키는
//   계정 존재 여부 노출을 막도록 설계돼 있음) 이 함수가 대신 확인한다.
// - generateLink(type: "recovery")는 가입된 이메일에만 성공하므로,
//   성공/실패 여부로 가입 여부를 판단한다(메일은 실제로 보내지 않음).
// ⚠️ SERVICE_ROLE 키는 이 함수(서버) 안에서만 쓰이고 클라이언트에 절대 안 나감.
//
// 배포: supabase functions deploy check-email-exists
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

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "요청 형식 오류" }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return json({ error: "이메일이 필요합니다." }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  return json({ exists: !error });
});
