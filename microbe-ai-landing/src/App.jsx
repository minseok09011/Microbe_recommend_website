import { useEffect, useState } from "react";
import MicrobeAiLandingPage from "./LandingPage.jsx";
import { CropSelect, AddressInput, LoadingScreen, ResultScreen, CheckScreen, CheckResultScreen } from "./AppFlow.jsx";
import { CROPS } from "./data.js";
import LoginScreen from "./LoginScreen.jsx";
import RecordsScreen from "./RecordsScreen.jsx";
import { onAuthChange, signOut } from "./records.js";

export default function App() {
  const [view, setView] = useState("landing"); // landing | crop | address | loading | result | check | records
  const [crop, setCrop] = useState(null);
  const [address, setAddress] = useState(null);
  const [result, setResult] = useState(null);
  const [checkPrefill, setCheckPrefill] = useState({ microbe: "", crop: "" });
  const [checkResult, setCheckResult] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(false); // 내 기록에서 결과를 다시 보는 중인지

  // 실제 인증 상태 (Supabase 세션). 새로고침/재방문에도 유지되며, 미설정 시 null.
  const [user, setUser] = useState(null);

  useEffect(() => onAuthChange(setUser), []);

  function handleLogin(u) {
    setUser(u);            // onAuthChange 리스너도 곧 갱신하지만 즉시 반영
    setView("landing");
    window.scrollTo(0, 0);
  }
  async function handleLogout() {
    await signOut();       // 리스너가 user를 null로 갱신
  }

  function goHome() {
    setView("landing");
    window.scrollTo(0, 0);
  }

  function startRecommend() {
    setCrop(null);
    setAddress(null);
    setViewingRecord(false);
    setView("crop");
  }

  function startCheck() {
    setCheckPrefill({ microbe: "", crop: "" });
    setViewingRecord(false);
    setView("check");
  }

  function startMyRecords() {
    setView("records");
    window.scrollTo(0, 0);
  }

  // 내 기록 카드를 눌렀을 때 — 저장된 payload로 결과 화면을 그대로 재출력
  function handleSelectRecord(r) {
    if (!r.payload) return;
    setViewingRecord(true);
    if (r.kind === "spray") {
      setCheckResult(r.payload);
      setView("checkResult");
    } else {
      setResult(r.payload.result || r.payload);
      setCrop(r.payload.crop ?? null);
      setAddress(r.payload.address ? { address: r.payload.address } : null);
      setView("result");
    }
    window.scrollTo(0, 0);
  }

  // 결과/살포 결과 화면의 "홈" — 기록에서 들어왔으면 기록 목록으로, 아니면 메인으로
  function backFromResult() {
    setView(viewingRecord ? "records" : "landing");
    window.scrollTo(0, 0);
  }

  function goToCheckFromResult() {
    const microbes = result?.microbes || result?.recommendations || (Array.isArray(result) ? result : result ? [result] : []);
    const top = microbes?.[0];
    const microbeName = top?.name || top?.korName || top?.korean_name || top?.species || "";
    const cropName = CROPS.find((c) => c.id === crop)?.name || crop || "";
    setCheckPrefill({ microbe: microbeName, crop: cropName });
    setView("check");
  }

  function handleLoadingDone(apiResult) {
    setResult(apiResult);
    setView("result");
  }

  function renderView() {
    switch (view) {
      case "login":
        return <LoginScreen onBack={goHome} onLogin={handleLogin} />;
      case "crop":
        return <CropSelect crop={crop} onSelect={setCrop} onBack={goHome} onNext={() => setView("address")} />;
      case "address":
        return (
          <AddressInput
            address={address}
            onSelect={setAddress}
            onBack={() => setView("crop")}
            onNext={() => setView("loading")}
            user={user}
          />
        );
      case "loading":
        return <LoadingScreen crop={crop} address={address} onDone={handleLoadingDone} />;
      case "result":
        return (
          <ResultScreen result={result} crop={crop} address={address} onCheck={goToCheckFromResult} onHome={backFromResult} />
        );
      case "check":
        return (
          <CheckScreen
            prefill={checkPrefill}
            onBack={goHome}
            onResult={(data) => {
              setViewingRecord(false);
              setCheckResult(data);
              setView("checkResult");
            }}
          />
        );
      case "checkResult":
        return <CheckResultScreen result={checkResult} onBack={backFromResult} />;
      case "records":
        return <RecordsScreen onBack={goHome} onSelect={handleSelectRecord} />;
      default:
        return (
          <MicrobeAiLandingPage
            onStartRecommend={startRecommend}
            onStartCheck={startCheck}
            user={user}
            onLoginClick={() => setView("login")}
            onLogout={handleLogout}
            onMyRecords={startMyRecords}
          />
        );
    }
  }

  return <>{renderView()}</>;
}
