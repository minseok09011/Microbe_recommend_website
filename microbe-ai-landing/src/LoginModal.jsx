import { useEffect, useState } from "react";
import { X, LogIn } from "lucide-react";

/* ──────────────────────────────────────────────────────────────
   데모(로컬) 로그인
   ※ 백엔드에 인증 API가 아직 없어, 지금은 브라우저에만 저장하는 데모 로그인입니다.
      나중에 실제 인증을 붙일 때 saveUser/loadUser/clearUser 안쪽과
      handleSubmit의 fetch만 교체하면 화면은 그대로 재사용됩니다.
────────────────────────────────────────────────────────────── */
const STORAGE_KEY = "tobio_user";

export function loadUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveUser(user) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    /* 저장 실패해도 로그인 자체는 진행 (세션 메모리로만 유지) */
  }
}
export function clearUser() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export default function LoginModal({ onClose, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // ESC로 닫기
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit() {
    const id = email.trim();
    if (!id) {
      setError("이메일(또는 아이디)을 입력해주세요.");
      return;
    }
    // 데모: 형식만 갖추면 로그인 성공 처리. 표시 이름은 이메일 앞부분.
    const name = id.includes("@") ? id.split("@")[0] : id;
    onLogin({ email: id, name });
  }

  function onKeyDown(e) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-white">
              <LogIn className="h-4 w-4" />
            </span>
            <h3 className="text-lg font-bold text-emerald-800">로그인</h3>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-stone-500">
          TOBio에 로그인하면 추천·살포 기록을 이어서 볼 수 있어요.
        </p>

        <label className="mb-1 block text-sm font-semibold text-stone-700">이메일</label>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError("");
          }}
          onKeyDown={onKeyDown}
          placeholder="example@tobio.kr"
          className="mb-3 w-full rounded-md border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600"
        />

        <label className="mb-1 block text-sm font-semibold text-stone-700">비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="••••••••"
          className="mb-2 w-full rounded-md border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600"
        />

        {error && <p className="mb-2 text-xs font-semibold text-rose-600">{error}</p>}

        <button
          onClick={handleSubmit}
          className="mt-2 w-full rounded-md bg-emerald-700 py-3 font-semibold text-white transition-colors hover:bg-emerald-800"
        >
          로그인
        </button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-400">
          현재는 데모 로그인입니다(브라우저에만 저장). 실제 계정 인증은 추후 백엔드 연동 시 적용됩니다.
        </p>
      </div>
    </div>
  );
}
