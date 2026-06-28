import { useEffect, useState } from "react";

/* ──────────────────────────────────────────────────────────────
   메인 페이지 "OUR SOLUTION" 섹션 하단의 빈 공간을 채우는 장식 애니메이션.
   왼쪽에서 걸어와 중간에 멈춰 냄새맡고, 더 걸어가 멈춰서 소리를 듣고,
   다시 걸어서 화면 밖으로 나간 뒤 처음부터 반복한다. 가운데 콘텐츠와
   겹치지 않도록 별도로 마련한 띠 영역 안에서만 움직인다.
────────────────────────────────────────────────────────────── */
const PHASES = ["walkA", "sniff", "walkB", "listen", "walkC", "pause"];
const DURATIONS = [4000, 2200, 3000, 2200, 3000, 2500];

const SPRITE_LOOP = "tobio-roam-bob 0.45s ease-in-out infinite alternate, tobio-roam-sprite-cycle 0.8s steps(1) infinite";

export default function TobioRoamer() {
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
        @keyframes tobio-roam-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes tobio-roam-sprite-cycle {
          0%, 12.49% { background-image: url(img/tobio-walk-1.png); }
          12.5%, 37.49% { background-image: url(img/tobio-walk-2.png); }
          37.5%, 62.49% { background-image: url(img/tobio-walk-3.png); }
          62.5%, 87.49% { background-image: url(img/tobio-walk-4.png); }
          87.5%, 100% { background-image: url(img/tobio-walk-1.png); }
        }
        @keyframes tobio-roam-walkA { 0% { left: -8%; } 100% { left: 38%; } }
        @keyframes tobio-roam-walkB { 0% { left: 38%; } 100% { left: 68%; } }
        @keyframes tobio-roam-walkC { 0% { left: 68%; } 100% { left: 112%; } }
        .tobio-roam-sprite {
          background-repeat: no-repeat;
          background-size: contain;
          background-position: center;
        }
        @keyframes tobio-roam-idle-tilt {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-6deg); }
        }
        .tobio-roam-idle {
          animation: tobio-roam-idle-tilt 1.1s ease-in-out infinite;
        }
      `}</style>

      {current === "walkA" && (
        <div
          key={phase}
          className="tobio-roam-sprite tobio-edge-clean absolute bottom-2 w-[56px] h-[88px]"
          style={{ left: "-8%", animation: `tobio-roam-walkA 4s linear forwards, ${SPRITE_LOOP}` }}
        />
      )}
      {current === "walkB" && (
        <div
          key={phase}
          className="tobio-roam-sprite tobio-edge-clean absolute bottom-2 w-[56px] h-[88px]"
          style={{ left: "38%", animation: `tobio-roam-walkB 3s linear forwards, ${SPRITE_LOOP}` }}
        />
      )}
      {current === "walkC" && (
        <div
          key={phase}
          className="tobio-roam-sprite tobio-edge-clean absolute bottom-2 w-[56px] h-[88px]"
          style={{ left: "68%", animation: `tobio-roam-walkC 3s linear forwards, ${SPRITE_LOOP}` }}
        />
      )}

      {current === "sniff" && (
        <div key={phase} className="absolute bottom-2" style={{ left: "38%" }}>
          <img src="img/tobio-sniff.png" alt="" className="tobio-roam-idle tobio-edge-clean h-20 w-auto object-contain" />
        </div>
      )}
      {current === "listen" && (
        <div key={phase} className="absolute bottom-2" style={{ left: "68%" }}>
          <img src="img/tobio-listen.png" alt="" className="tobio-roam-idle tobio-edge-clean h-20 w-auto object-contain" />
        </div>
      )}
    </div>
  );
}
