import { useEffect, useState } from "react";

/* ──────────────────────────────────────────────────────────────
   메인 페이지 "OUR SOLUTION" 섹션 하단 빈 공간을 채우는 장식 애니메이션.
   왼쪽에서 걸어와 가운데서 멈춰 정면으로 돌아서서 손을 흔든 뒤,
   다시 옆으로 돌아 걸어서 화면 밖으로 나간다. tobio-walk-1~4.png(걷기),
   tobio-turn-1~7.png(측면→정면 회전), tobio-front-1~13.png(정면 손 흔들기)는
   모두 토비오 원본 디자인 시트에서 잘라낸 동일 캐릭터 에셋.
────────────────────────────────────────────────────────────── */
const WALK_FRAMES = [1, 2, 3, 4].map((n) => `img/tobio-walk-${n}.png`);
const TURN_IN_FRAMES = [1, 2, 3, 4, 5, 6, 7].map((n) => `img/tobio-turn-${n}.png`);
const TURN_OUT_FRAMES = [...TURN_IN_FRAMES].reverse();
const WAVE_FRAMES = Array.from({ length: 13 }, (_, i) => `img/tobio-front-${i + 1}.png`);

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

const PHASES = ["walkIn", "turnIn", "wave", "turnOut", "walkOut", "pause"];
const DURATIONS = [3500, 1200, 2600, 1200, 3500, 2200];
const STOP_LEFT = "46%";

export default function TobioGreeter() {
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
    <div className="relative h-28 mt-10 overflow-hidden" aria-hidden="true">
      <style>{`
        ${stepsKeyframes("tobio-greet-walk-cycle", WALK_FRAMES)}
        ${stepsKeyframes("tobio-greet-turn-in", TURN_IN_FRAMES)}
        ${stepsKeyframes("tobio-greet-turn-out", TURN_OUT_FRAMES)}
        ${stepsKeyframes("tobio-greet-wave-cycle", WAVE_FRAMES)}
        @keyframes tobio-greet-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes tobio-greet-walk-in { 0% { left: -8%; } 100% { left: ${STOP_LEFT}; } }
        @keyframes tobio-greet-walk-out { 0% { left: ${STOP_LEFT}; } 100% { left: 112%; } }
        .tobio-greet-sprite {
          background-repeat: no-repeat;
          background-size: contain;
          background-position: bottom center;
        }
      `}</style>

      {current === "walkIn" && (
        <div
          key={phase}
          className="tobio-greet-sprite absolute bottom-2 w-[56px] h-[88px]"
          style={{
            left: "-8%",
            animation: "tobio-greet-walk-in 3.5s linear forwards, tobio-greet-bob 0.45s ease-in-out infinite alternate, tobio-greet-walk-cycle 0.8s steps(1) infinite",
          }}
        />
      )}

      {current === "turnIn" && (
        <div
          key={phase}
          className="tobio-greet-sprite absolute bottom-2 w-20 h-[100px]"
          style={{ left: STOP_LEFT, animation: "tobio-greet-turn-in 1.2s steps(1) forwards" }}
        />
      )}

      {current === "wave" && (
        <div
          key={phase}
          className="tobio-greet-sprite absolute bottom-2 w-20 h-[100px]"
          style={{ left: STOP_LEFT, animation: "tobio-greet-wave-cycle 1.1s steps(1) infinite" }}
        />
      )}

      {current === "turnOut" && (
        <div
          key={phase}
          className="tobio-greet-sprite absolute bottom-2 w-20 h-[100px]"
          style={{ left: STOP_LEFT, animation: "tobio-greet-turn-out 1.2s steps(1) forwards" }}
        />
      )}

      {current === "walkOut" && (
        <div
          key={phase}
          className="tobio-greet-sprite absolute bottom-2 w-[56px] h-[88px]"
          style={{
            left: STOP_LEFT,
            animation: "tobio-greet-walk-out 3.5s linear forwards, tobio-greet-bob 0.45s ease-in-out infinite alternate, tobio-greet-walk-cycle 0.8s steps(1) infinite",
          }}
        />
      )}
    </div>
  );
}
