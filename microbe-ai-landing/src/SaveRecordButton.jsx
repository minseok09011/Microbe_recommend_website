import { useEffect, useState } from "react";
import { authReady, onAuthChange, saveRecord, checkDuplicateRecord } from "./records.js";

/* 결과 화면에 얹는 "내 기록에 저장" 버튼.
   - Supabase 미설정이면 아무것도 렌더 안 함.
   - 비로그인이면 안내 문구만(핵심 기능은 로그인 없이도 동작).
   - props.build(): 저장할 record 객체를 반환하는 함수(클릭 시점 데이터). */
export default function SaveRecordButton({ build }) {
  const [user, setUser] = useState(null);
  const [state, setState] = useState("idle"); // idle | saving | done | duplicate | error
  const [msg, setMsg] = useState("");

  useEffect(() => onAuthChange(setUser), []);

  useEffect(() => {
    if (!user) return;
    const rec = build();
    checkDuplicateRecord(rec.kind, rec.crop, rec.summary).then((dup) => {
      if (dup) setState("duplicate");
    });
  }, [user]);

  if (!authReady()) return null;

  if (!user) {
    return (
      <p className="text-center text-xs text-stone-400 mt-1">
        로그인하면 이 결과를 <span className="font-semibold text-stone-500">내 기록</span>에 저장할 수 있어요.
      </p>
    );
  }

  async function handleSave() {
    setState("saving");
    setMsg("");
    try {
      await saveRecord(build());
      setState("done");
    } catch (e) {
      const isDup = (e?.message || "").includes("이미 기록");
      setState(isDup ? "duplicate" : "error");
      setMsg(isDup ? "" : (e?.message || "저장에 실패했습니다."));
    }
  }

  return (
    <div className="w-full">
      {state === "duplicate" ? (
        <p className="w-full rounded-md py-3 text-center font-semibold bg-stone-100 text-stone-500">
          이미 기록한 결과입니다
        </p>
      ) : (
        <button
          onClick={handleSave}
          disabled={state === "saving" || state === "done"}
          className={`w-full rounded-md py-3 font-semibold transition-colors ${
            state === "done"
              ? "bg-emerald-100 text-emerald-700 cursor-default"
              : "bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60"
          }`}
        >
          {state === "done" ? "✅ 내 기록에 저장됨" : state === "saving" ? "저장 중…" : "📝 내 기록에 저장"}
        </button>
      )}
      {state === "error" && <p className="mt-1 text-center text-xs font-semibold text-rose-600">{msg}</p>}
    </div>
  );
}
