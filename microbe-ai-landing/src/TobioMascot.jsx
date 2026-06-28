import { useEffect, useState } from "react";
import TobioActionBubble from "./TobioActionBubble.jsx";

/* ──────────────────────────────────────────────────────────────
   로그인 화면 왼쪽 패널(밭 사진, 가운데 길)을 꾸미는 토비오 애니메이션.
   - "approach": 길 안쪽 먼 곳에서 점점 커지며 걸어 내려옴(원근감).
   - "inspect"/"sniff"/"listen": 길 가운데서 멈춰 돋보기로 살피고,
     냄새를 맡고, 소리를 듣는 모습을 말풍선 이모지로 표현.
   - "depart": 다시 걸어서 화면 아래(시점 가까이)로 사라짐.
   tobio-walk-1~4.png, tobio.png는 기존 로딩화면과 같은 에셋을 재사용.
────────────────────────────────────────────────────────────── */
const PHASES = ["approach", "inspect", "sniff", "listen", "depart", "pause"];
const DURATIONS = [5500, 2200, 1800, 1800, 3000, 2500]; // ms, PHASES와 같은 순서

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
  // 길 가운데서 멈추는 지점 — approach/depart 키프레임의 76% 지점과 맞춰둔다.
  const idleStyle = { top: "76%", left: "50%", transform: "translate(-50%, -50%) scale(1.05)" };

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes tobio-path-sprite-cycle {
          0%, 12.49% { background-image: url(img/tobio-walk-1.png); }
          12.5%, 37.49% { background-image: url(img/tobio-walk-2.png); }
          37.5%, 62.49% { background-image: url(img/tobio-walk-3.png); }
          62.5%, 87.49% { background-image: url(img/tobio-walk-4.png); }
          87.5%, 100% { background-image: url(img/tobio-walk-1.png); }
        }
        .tobio-path-sprite {
          background-repeat: no-repeat;
          background-size: contain;
          background-position: center;
          width: 64px;
          height: 100px;
        }
        @keyframes tobio-approach {
          0%   { top: 34%; opacity: 0; transform: translate(-50%, -50%) scale(0.15); }
          10%  { opacity: 1; }
          100% { top: 76%; opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
        }
        @keyframes tobio-depart {
          0%   { top: 76%; opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
          70%  { top: 94%; opacity: 1; transform: translate(-50%, -50%) scale(1.55); }
          100% { top: 102%; opacity: 0; transform: translate(-50%, -50%) scale(1.7); }
        }
        @keyframes tobio-idle-tilt {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-5deg); }
        }
        .tobio-idle-img {
          animation: tobio-idle-tilt 1.2s ease-in-out infinite;
        }
      `}</style>

      {current === "approach" && (
        <div
          key={phase}
          className="tobio-path-sprite tobio-edge-clean absolute"
          style={{ left: "50%", animation: "tobio-approach 5.5s ease-in forwards, tobio-path-sprite-cycle 0.8s steps(1) infinite" }}
        />
      )}

      {(current === "inspect" || current === "sniff" || current === "listen") && (
        <div key={phase} className="absolute" style={idleStyle}>
          <img src="img/tobio.png" alt="" className="tobio-idle-img tobio-edge-clean h-24 w-auto object-contain drop-shadow-lg" />
          <TobioActionBubble
            emoji={current === "inspect" ? "🔍" : current === "sniff" ? "🌸" : "🎵"}
            style={{ top: "-12px", right: "-10px" }}
          />
        </div>
      )}

      {current === "depart" && (
        <div
          key={phase}
          className="tobio-path-sprite tobio-edge-clean absolute"
          style={{ left: "50%", top: "76%", animation: "tobio-depart 3s ease-in forwards, tobio-path-sprite-cycle 0.8s steps(1) infinite" }}
        />
      )}
    </div>
  );
}
