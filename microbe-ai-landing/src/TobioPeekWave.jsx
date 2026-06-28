import { useEffect, useState } from "react";

/* ──────────────────────────────────────────────────────────────
   로그인 화면에서 왼쪽 사진 패널과 오른쪽 로그인 폼의 경계선 쪽을
   꾸미는 애니메이션. 경계 뒤에서 토비오가 빼꼼 나와 손을 흔들다가
   다시 경계 뒤로 서서히 사라진다. tobio-peek-1~16.png는 경계 뒤에서
   몸을 내밀며 정면으로 도는 모습, tobio-wave-1~16.png는 정면에서
   손을 흔드는 모습 — 모두 토비오 원본 디자인 시트에서 잘라낸 에셋.
────────────────────────────────────────────────────────────── */
const PEEK_IN_FRAMES = Array.from({ length: 16 }, (_, i) => `img/tobio-peek-${i + 1}.png`);
const PEEK_OUT_FRAMES = [...PEEK_IN_FRAMES].reverse();
const WAVE_FRAMES = Array.from({ length: 16 }, (_, i) => `img/tobio-wave-${i + 1}.png`);

function stepsKeyframes(name, frames) {
  const n = frames.length;
  const step = 100 / n;
  const lines = frames.map((f, i) => {
    const start = (i * step).toFixed(3);
    const end = (Math.min((i + 1) * step, 100) - 0.01).toFixed(3);
    return `  ${start}%, ${end}% { background-image: url(${f}); }`;
  });
  return `@keyframes ${name} {\n${lines.join("\n")}\n}`;
}

const PHASES = ["emerge", "wave", "retreat", "hidden"];
const DURATIONS = [1500, 2600, 1500, 2600];

export default function TobioPeekWave() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let timer;
    function schedule(i) {
      timer = setTimeout(() => {
        const next = (i + 1) % PHASES.length;
        setPhase(next);
        schedule(next);
      }, DURATIONS[i]);
    }
    schedule(0);
    return () => clearTimeout(timer);
  }, []);

  const current = PHASES[phase];

  return (
    <div className="absolute inset-y-0 right-0 w-32 overflow-hidden" aria-hidden="true">
      <style>{`
        ${stepsKeyframes("tobio-peek-emerge", PEEK_IN_FRAMES)}
        ${stepsKeyframes("tobio-peek-retreat", PEEK_OUT_FRAMES)}
        ${stepsKeyframes("tobio-peek-wave-cycle", WAVE_FRAMES)}
        @keyframes tobio-peek-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .tobio-peek-sprite {
          background-repeat: no-repeat;
          background-size: contain;
          background-position: bottom right;
          filter: drop-shadow(0 6px 10px rgba(0,0,0,0.35));
        }
      `}</style>

      {current === "emerge" && (
        <div
          key={phase}
          className="tobio-peek-sprite absolute bottom-[18%] right-0 w-28 h-36"
          style={{ animation: "tobio-peek-emerge 1.5s steps(1) forwards" }}
        />
      )}

      {current === "wave" && (
        <div
          key={phase}
          className="tobio-peek-sprite absolute bottom-[18%] right-0 w-28 h-36"
          style={{ animation: "tobio-peek-wave-cycle 1.1s steps(1) infinite, tobio-peek-bob 0.5s ease-in-out infinite alternate" }}
        />
      )}

      {current === "retreat" && (
        <div
          key={phase}
          className="tobio-peek-sprite absolute bottom-[18%] right-0 w-28 h-36"
          style={{ animation: "tobio-peek-retreat 1.5s steps(1) forwards" }}
        />
      )}
    </div>
  );
}
