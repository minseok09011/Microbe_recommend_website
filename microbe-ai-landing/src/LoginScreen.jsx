import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  authReady,
  signIn,
  signUp,
  normalizeUser,
  checkEmailRegistered,
  requestPasswordReset,
  verifyResetCode,
  updatePassword,
} from "./records.js";
import TobioMascot from "./TobioMascot.jsx";

/* ──────────────────────────────────────────────────────────────
   로그인 / 회원가입 / 비밀번호 찾기 전체 화면.
   - 비밀번호 해시·세션 유지·토큰 갱신은 Supabase가 처리.
   - Supabase 미설정(authReady=false)이면 안내만 표시.
   - 비밀번호 찾기: 이메일 → 인증번호 → 새 비밀번호 3단계.
     (Supabase 대시보드의 Reset Password 메일 템플릿이 {{ .Token }}을
     포함해야 링크 대신 8자리 인증번호가 발송됨)
────────────────────────────────────────────────────────────── */
export default function LoginScreen({ onBack, onLogin }) {
  const [view, setView] = useState("login"); // login | signup | forgotEmail | forgotCode | forgotNew
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0); // 인증번호 재전송까지 남은 초

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onBack();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onBack]);

  // 재전송 쿨다운 1초씩 감소
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  function switchMode(next) {
    setView(next);
    setError("");
    setInfo("");
    setResendCooldown(0);
  }

  async function handleSubmit() {
    setError("");
    setInfo("");
    const id = email.trim();
    if (!id || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    if (view === "signup" && password.length < 6) {
      setError("비밀번호는 6자 이상으로 만들어주세요.");
      return;
    }
    if (!authReady()) {
      setError("로그인 기능이 아직 설정되지 않았습니다. (관리자 설정 필요)");
      return;
    }

    setBusy(true);
    try {
      if (view === "signup") {
        const data = await signUp(id, password);
        if (data.session) {
          onLogin(normalizeUser(data.user)); // 즉시 로그인됨
        } else {
          // 이메일 인증이 켜진 프로젝트 — 확인 메일 안내
          setInfo("확인 메일을 보냈어요. 메일의 링크로 인증한 뒤 로그인해주세요.");
          setView("login");
        }
      } else {
        const data = await signIn(id, password);
        onLogin(normalizeUser(data.user));
      }
    } catch (e) {
      setError(authErrorToKorean(e, view));
    } finally {
      setBusy(false);
    }
  }

  // 비밀번호 찾기 1단계: 인증번호 발송(+ 재전송)
  async function handleRequestReset() {
    if (resendCooldown > 0) return;
    setError("");
    setInfo("");
    const id = resetEmail.trim();
    if (!id) {
      setError("가입한 이메일을 입력해주세요.");
      return;
    }
    if (!authReady()) {
      setError("로그인 기능이 아직 설정되지 않았습니다. (관리자 설정 필요)");
      return;
    }
    setBusy(true);
    try {
      let registered = true;
      try {
        registered = await checkEmailRegistered(id);
      } catch {
        registered = true; // 확인 함수 자체가 실패하면 발송 자체는 막지 않음
      }
      if (!registered) {
        setError("가입되지 않은 이메일입니다. 이메일을 다시 확인해주세요.");
        return;
      }
      await requestPasswordReset(id);
      setResetCode("");
      setResendCooldown(60); // 재전송은 1분에 한 번만
      setView("forgotCode");
    } catch (e) {
      setError(authErrorToKorean(e, "reset"));
    } finally {
      setBusy(false);
    }
  }

  // 비밀번호 찾기 2단계: 인증번호 확인
  async function handleVerifyCode() {
    setError("");
    const code = resetCode.trim();
    if (!code) {
      setError("이메일로 받은 인증번호를 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      await verifyResetCode(resetEmail, code);
      setView("forgotNew");
    } catch (e) {
      setError(authErrorToKorean(e, "reset"));
      setResetCode(""); // 틀린 인증번호는 지우고 다시 입력하게
    } finally {
      setBusy(false);
    }
  }

  // 비밀번호 찾기 3단계: 새 비밀번호 적용
  async function handleSetNewPassword() {
    setError("");
    if (newPassword.length < 6) {
      setError("비밀번호는 6자 이상으로 만들어주세요.");
      return;
    }
    if (newPassword !== newPassword2) {
      setError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      const data = await updatePassword(newPassword);
      // verifyResetCode에서 받은 세션으로 비밀번호를 바꿨으므로 이미 로그인된 상태
      onLogin(normalizeUser(data.user));
    } catch (e) {
      setError(authErrorToKorean(e, "reset"));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") handleSubmit();
  }

  const isSignup = view === "signup";
  const isForgot = view === "forgotEmail" || view === "forgotCode" || view === "forgotNew";

  return (
    <div className="min-h-screen flex bg-stone-50">
      {/* 왼쪽 비주얼 패널 */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden bg-cover bg-center" style={{ backgroundImage: "url(img/dan-meyers-IQVFVH0ajag-unsplash.jpg)" }}>
        <TobioMascot />
        <div className="relative z-10 m-auto px-10 text-center">
          <h2 className="text-2xl font-bold text-white drop-shadow">TOBio와 함께 건강한 농사</h2>
          <p className="mt-3 text-sm leading-relaxed text-emerald-50/85">
            맞춤 미생물 추천부터 살포 기록까지,
            <br />
            토비오가 곁에서 도와드려요.
          </p>
        </div>
      </div>

      {/* 오른쪽 폼 패널 */}
      <div className="flex w-full md:w-1/2 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <button
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-stone-400 hover:text-stone-600"
          >
            <ArrowLeft className="h-4 w-4" /> 홈으로
          </button>

          <h3 className="mb-1 text-lg font-bold text-emerald-800">
            {isForgot ? "비밀번호 찾기" : isSignup ? "회원가입" : "로그인"}
          </h3>

          {!isForgot && (
            <>
              {/* 탭 */}
              <div className="mb-4 mt-4 grid grid-cols-2 rounded-lg bg-stone-100 p-1 text-sm font-semibold">
                <button
                  onClick={() => switchMode("login")}
                  className={`rounded-md py-1.5 transition-colors ${!isSignup ? "bg-white text-emerald-800 shadow-sm" : "text-stone-500"}`}
                >
                  로그인
                </button>
                <button
                  onClick={() => switchMode("signup")}
                  className={`rounded-md py-1.5 transition-colors ${isSignup ? "bg-white text-emerald-800 shadow-sm" : "text-stone-500"}`}
                >
                  회원가입
                </button>
              </div>

              <p className="mb-4 text-xs leading-relaxed text-stone-500">
                TOBio에 로그인하면 추천·살포 결과를 내 기록에 저장해 다시 볼 수 있어요.
              </p>

              <label className="mb-1 block text-sm font-semibold text-stone-700">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                onKeyDown={onKeyDown}
                placeholder="example@tobio.kr"
                autoComplete="email"
                className="mb-3 w-full rounded-md border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600"
              />

              <label className="mb-1 block text-sm font-semibold text-stone-700">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={onKeyDown}
                placeholder={isSignup ? "6자 이상" : "••••••••"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                className="mb-2 w-full rounded-md border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600"
              />

              {!isSignup && (
                <button
                  type="button"
                  onClick={() => { setResetEmail(email); switchMode("forgotEmail"); }}
                  className="mb-2 block text-xs font-semibold text-emerald-700 hover:underline"
                >
                  비밀번호를 잊으셨나요?
                </button>
              )}

              {error && <p className="mb-2 text-xs font-semibold text-rose-600">{error}</p>}
              {info && <p className="mb-2 text-xs font-semibold text-emerald-700">{info}</p>}

              <button
                onClick={handleSubmit}
                disabled={busy}
                className="mt-2 w-full rounded-md bg-emerald-700 py-3 font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
              >
                {busy ? "처리 중…" : isSignup ? "회원가입" : "로그인"}
              </button>

              <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-400">
                {isSignup
                  ? "이미 계정이 있으면 위의 ‘로그인’ 탭을 눌러주세요."
                  : "계정이 없으면 위의 ‘회원가입’ 탭에서 만들 수 있어요."}
              </p>
            </>
          )}

          {view === "forgotEmail" && (
            <>
              <p className="mb-4 mt-4 text-xs leading-relaxed text-stone-500">
                가입할 때 사용한 이메일을 입력하면 인증번호를 보내드려요.
              </p>
              <label className="mb-1 block text-sm font-semibold text-stone-700">이메일</label>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => { setResetEmail(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleRequestReset()}
                placeholder="example@tobio.kr"
                autoComplete="email"
                className="mb-2 w-full rounded-md border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600"
              />
              {error && <p className="mb-2 text-xs font-semibold text-rose-600">{error}</p>}
              <button
                onClick={handleRequestReset}
                disabled={busy}
                className="mt-2 w-full rounded-md bg-emerald-700 py-3 font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
              >
                {busy ? "보내는 중…" : "인증번호 보내기"}
              </button>
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="mt-3 block w-full text-center text-xs font-semibold text-stone-400 hover:text-stone-600"
              >
                로그인으로 돌아가기
              </button>
            </>
          )}

          {view === "forgotCode" && (
            <>
              <p className="mb-4 mt-4 text-xs leading-relaxed text-stone-500">
                <strong className="text-stone-700">{resetEmail}</strong> 로 보낸 8자리 인증번호를 입력해주세요.
              </p>
              <label className="mb-1 block text-sm font-semibold text-stone-700">인증번호</label>
              <input
                type="text"
                inputMode="numeric"
                value={resetCode}
                onChange={(e) => { setResetCode(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
                placeholder="8자리 숫자"
                autoComplete="one-time-code"
                className="mb-2 w-full rounded-md border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600"
              />
              {error && <p className="mb-2 text-xs font-semibold text-rose-600">{error}</p>}
              <button
                onClick={handleVerifyCode}
                disabled={busy}
                className="mt-2 w-full rounded-md bg-emerald-700 py-3 font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
              >
                {busy ? "확인 중…" : "확인"}
              </button>
              <button
                type="button"
                onClick={handleRequestReset}
                disabled={busy || resendCooldown > 0}
                className="mt-3 block w-full text-center text-xs font-semibold text-emerald-700 hover:underline disabled:text-stone-400 disabled:no-underline"
              >
                {resendCooldown > 0 ? `인증번호 다시 받기 (${resendCooldown}초 후 가능)` : "인증번호 다시 받기"}
              </button>
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="mt-1 block w-full text-center text-xs font-semibold text-stone-400 hover:text-stone-600"
              >
                로그인으로 돌아가기
              </button>
            </>
          )}

          {view === "forgotNew" && (
            <>
              <p className="mb-4 mt-4 text-xs leading-relaxed text-stone-500">
                인증이 완료됐어요. 새 비밀번호를 설정해주세요.
              </p>
              <label className="mb-1 block text-sm font-semibold text-stone-700">새 비밀번호</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                placeholder="6자 이상"
                autoComplete="new-password"
                className="mb-3 w-full rounded-md border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600"
              />
              <label className="mb-1 block text-sm font-semibold text-stone-700">새 비밀번호 확인</label>
              <input
                type="password"
                value={newPassword2}
                onChange={(e) => { setNewPassword2(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleSetNewPassword()}
                placeholder="다시 입력"
                autoComplete="new-password"
                className="mb-2 w-full rounded-md border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600"
              />
              {error && <p className="mb-2 text-xs font-semibold text-rose-600">{error}</p>}
              <button
                onClick={handleSetNewPassword}
                disabled={busy}
                className="mt-2 w-full rounded-md bg-emerald-700 py-3 font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
              >
                {busy ? "변경 중…" : "비밀번호 변경"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Supabase 인증 에러를 농민이 이해할 한국어로
function authErrorToKorean(e, mode) {
  const m = (e?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "이메일 또는 비밀번호를 확인해주세요.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "이미 가입된 이메일입니다. ‘로그인’ 탭을 이용해주세요.";
  if (m.includes("email") && m.includes("confirm")) return "이메일 인증이 필요합니다. 메일을 확인해주세요.";
  if (mode === "reset" && (m.includes("token") || m.includes("otp") || m.includes("expired")))
    return "인증번호가 틀렸습니다. 다시 입력하거나, 안 왔다면 재전송 버튼을 눌러주세요.";
  if (m.includes("password")) return "비밀번호 조건을 확인해주세요(6자 이상).";
  if (m.includes("rate limit")) return "요청이 많습니다. 잠시 후 다시 시도해주세요.";
  if (mode === "reset") return "비밀번호 찾기 중 오류가 발생했습니다: " + (e?.message || "알 수 없음");
  return (mode === "signup" ? "회원가입" : "로그인") + " 중 오류가 발생했습니다: " + (e?.message || "알 수 없음");
}
