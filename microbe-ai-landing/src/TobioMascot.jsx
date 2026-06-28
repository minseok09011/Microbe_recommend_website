import { useEffect, useState } from "react";

/* ──────────────────────────────────────────────────────────────
   로그인 화면 왼쪽 패널을 꾸미는 토비오 장식 애니메이션.
   - "walk": 화면 아래쪽을 4프레임 걷기 스프라이트로 가로질러 걸어감.
   - "peekLeft"/"peekRight": 좌/우 모서리 아래에서 빼꼼 올라왔다 사라짐.
   tobio-walk-1~4.png, tobio.png는 기존 로딩화면에서 쓰는 것과 동일한 에셋.
────────────────────────────────────────────────────────────── */
const PHASES = ["walk", "peekLeft", "walk", "peekRight"];
const DURATIONS = [7000, 3000, 7000, 3000]; // ms, PHASES와 같은 순서

export default function TobioMascot() {
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
    <div className="absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes tobio-login-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes tobio-login-sprite-cycle {
          0%, 12.49% { background-image: url(img/tobio-walk-1.png); }
          12.5%, 37.49% { background-image: url(img/tobio-walk-2.png); }
          37.5%, 62.49% { background-image: url(img/tobio-walk-3.png); }
          62.5%, 87.49% { background-image: url(img/tobio-walk-4.png); }
          87.5%, 100% { background-image: url(img/tobio-walk-1.png); }
        }
        @keyframes tobio-cross {
          0% { left: -12%; }
          100% { left: 108%; }
        }
        .tobio-login-walk-sprite {
          background-repeat: no-repeat;
          background-size: contain;
          background-position: center;
          animation:
            tobio-login-bob 0.45s ease-in-out infinite alternate,
            tobio-login-sprite-cycle 0.8s steps(1) infinite,
            tobio-cross 7s linear forwards;
        }
        @keyframes tobio-peek {
          0%, 100% { transform: translateY(90%); opacity: 0; }
          18%, 72% { transform: translateY(8%); opacity: 1; }
          90% { transform: translateY(90%); opacity: 0; }
        }
        .tobio-login-peek {
          animation: tobio-peek 3s ease-in-out forwards;
        }
      `}</style>

      {current === "walk" && (
        <div
          key={phase}
          className="tobio-login-walk-sprite absolute bottom-12 w-[64px] h-[100px]"
          style={{ left: "-12%" }}
        />
      )}

      {current === "peekLeft" && (
        <div key={phase} className="tobio-login-peek absolute bottom-0 left-6 h-24 w-auto">
          <img src="img/tobio.png" alt="" className="h-24 w-auto object-contain drop-shadow-xl" />
        </div>
      )}

      {current === "peekRight" && (
        <div key={phase} className="tobio-login-peek absolute bottom-0 right-6 h-24 w-auto">
          <img
            src="img/tobio.png"
            alt=""
            className="h-24 w-auto object-contain drop-shadow-xl"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      )}
    </div>
  );
}
