import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Sprout, FlaskConical } from "lucide-react";
import { listMyRecords } from "./records.js";

/* "내 기록" 목록 (최소 범위: 저장한 추천/살포 결과를 다시 보기) */
export default function RecordsScreen({ onBack, onSelect }) {
  const [rows, setRows] = useState(null); // null=로딩, []=비어있음
  const [err, setErr] = useState("");

  useEffect(() => {
    listMyRecords()
      .then(setRows)
      .catch((e) => {
        setErr(e?.message || "기록을 불러오지 못했습니다.");
        setRows([]);
      });
  }, []);

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <header className="bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-stone-500 hover:text-stone-800" aria-label="홈으로">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-emerald-800">📒 내 기록</h1>
      </header>

      <div className="flex-1 max-w-lg w-full mx-auto px-5 py-6">
        {rows === null && <p className="text-center text-stone-500 py-10">불러오는 중…</p>}

        {err && (
          <p className="text-center text-sm text-rose-600 py-4">⚠️ {err}</p>
        )}

        {rows && rows.length === 0 && !err && (
          <div className="text-center py-16 text-stone-500">
            <FileText className="h-12 w-12 mx-auto mb-3 text-stone-300" />
            <p className="font-semibold mb-1">아직 저장한 기록이 없어요</p>
            <p className="text-sm text-stone-400">추천·살포 결과 화면에서 “내 기록에 저장”을 눌러보세요.</p>
          </div>
        )}

        <div className="space-y-3">
          {rows?.map((r) => {
            const isSpray = r.kind === "spray";
            return (
              <button
                key={r.id}
                onClick={() => onSelect?.(r)}
                disabled={!onSelect || !r.payload}
                className="block w-full text-left bg-white rounded-xl shadow-sm border border-stone-100 p-4 disabled:cursor-default hover:border-emerald-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-0.5 ${
                      isSpray ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {isSpray ? <FlaskConical className="h-3 w-3" /> : <Sprout className="h-3 w-3" />}
                    {isSpray ? "살포 확인" : "미생물 추천"}
                  </span>
                  <span className="text-xs text-stone-400">{(r.created_at || "").slice(0, 10)}</span>
                </div>
                <p className="font-semibold text-stone-800">{r.title || (isSpray ? "살포 확인 결과" : "추천 결과")}</p>
                {r.crop && <p className="text-xs text-stone-500 mt-0.5">작물: {r.crop}</p>}
                {r.summary && <p className="text-sm text-stone-600 mt-1 leading-relaxed">{r.summary}</p>}
                {r.payload && <p className="text-xs text-emerald-600 font-semibold mt-2">결과 다시 보기 →</p>}
              </button>
            );
          })}
        </div>

        <button
          onClick={onBack}
          className="mt-6 w-full rounded-md border-2 border-emerald-700 text-emerald-700 font-semibold py-3 hover:bg-emerald-50"
        >
          홈으로 돌아가기
        </button>
      </div>
    </div>
  );
}
