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

// 기록 저장 — user_id 미포함(RLS 기본값 auth.uid())
export async function saveRecord(rec) {
  ensure();
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
