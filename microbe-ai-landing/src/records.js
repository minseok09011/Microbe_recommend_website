/* ============================================================
   인증 + 영농기록 (Supabase)
   ------------------------------------------------------------
   - 인증: Supabase가 비밀번호 해시·세션·JWT 갱신을 처리(관리형).
   - 기록: public.records 테이블, RLS로 본인 것만(user_id = auth.uid()).
     insert 시 user_id를 보내지 않는다(DB 기본값 auth.uid()).
   ============================================================ */
import { supabase, supabaseEnabled } from "./supabaseClient.js";

export function authReady() {
  return supabaseEnabled;
}

// Supabase user → 화면용 형태 { id, email, name }
export function normalizeUser(u) {
  if (!u) return null;
  const email = u.email || "";
  const name = email.includes("@") ? email.split("@")[0] : email || "사용자";
  return { id: u.id, email, name };
}

// 현재 로그인 사용자(없으면 null)
export async function getCurrentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return normalizeUser(data.session?.user || null);
}

// 로그인 상태 변화 구독. 즉시 현재 상태도 1회 전달. 해제 함수 반환.
export function onAuthChange(cb) {
  if (!supabase) {
    cb(null);
    return () => {};
  }
  supabase.auth.getSession().then(({ data }) => cb(normalizeUser(data.session?.user || null)));
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
    cb(normalizeUser(session?.user || null))
  );
  return () => sub.subscription.unsubscribe();
}

function ensure() {
  if (!supabase) throw new Error("로그인 기능이 아직 설정되지 않았습니다.");
}

// 회원가입. 이메일 인증이 켜진 프로젝트면 session이 null일 수 있음(인증 메일 안내).
export async function signUp(email, password) {
  ensure();
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  return data; // { user, session }
}

export async function signIn(email, password) {
  ensure();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

// 비밀번호 찾기 전: 가입된 이메일인지 서버(check-email-exists Edge Function)에 확인.
// anon 키로는 계정 존재 여부를 알 수 없어서(보안상 의도된 제한) 별도 함수가 필요.
export async function checkEmailRegistered(email) {
  ensure();
  const { data, error } = await supabase.functions.invoke("check-email-exists", {
    body: { email: email.trim() },
  });
  if (error) throw error;
  return Boolean(data?.exists);
}

// 비밀번호 찾기 1단계: 가입된 이메일로 8자리 인증번호 발송
export async function requestPasswordReset(email) {
  ensure();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}

// 비밀번호 찾기 2단계: 인증번호 확인(통과하면 임시 세션 발급)
export async function verifyResetCode(email, code) {
  ensure();
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: "recovery",
  });
  if (error) throw error;
  return data; // { user, session }
}

// 비밀번호 찾기 3단계: 새 비밀번호로 변경(2단계 통과 세션 필요)
export async function updatePassword(newPassword) {
  ensure();
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

// 중복 기록 확인 — 같은 kind + crop + summary 조합이 이미 있는지
export async function checkDuplicateRecord(kind, crop, summary) {
  if (!supabase) return false;
  let query = supabase
    .from("records")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind);
  if (crop) query = query.eq("crop", crop);
  if (summary) query = query.eq("summary", summary);
  const { count, error } = await query;
  if (error) return false;
  return (count || 0) > 0;
}

// 기록 저장 — user_id 미포함(RLS 기본값 auth.uid())
export async function saveRecord(rec) {
  ensure();
  const isDup = await checkDuplicateRecord(rec.kind, rec.crop, rec.summary);
  if (isDup) throw new Error("이미 기록한 결과입니다.");
  const { data, error } = await supabase
    .from("records")
    .insert({
      kind: rec.kind,
      title: rec.title || null,
      crop: rec.crop || null,
      summary: rec.summary || null,
      payload: rec.payload ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 기록 삭제 — RLS가 본인 것만 삭제 허용
export async function deleteRecord(id) {
  ensure();
  const { error } = await supabase.from("records").delete().eq("id", id);
  if (error) throw error;
}

// 내 기록 목록 (RLS가 본인 것만 반환)
export async function listMyRecords() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("records")
    .select("id, kind, title, crop, summary, payload, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// 로그인한 사용자가 "내 기록에 저장"한 추천 결과들에서 최근 사용한 주소를 뽑아온다.
// (저장하지 않은 추천은 기록이 없으므로 여기 나오지 않음)
export async function listMyRecentAddresses(limit = 5) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("records")
    .select("payload, crop, created_at")
    .eq("kind", "recommend")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;

  const seen = new Set();
  const out = [];
  for (const row of data || []) {
    const addr = row.payload?.address;
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    out.push({ address: addr, crop: row.crop || "" });
    if (out.length >= limit) break;
  }
  return out;
}
