import { useState } from "react";
import MicrobeAiLandingPage from "./LandingPage.jsx";
import { CropSelect, AddressInput, LoadingScreen, ResultScreen, CheckScreen } from "./AppFlow.jsx";
import { CROPS } from "./data.js";
import LoginModal, { loadUser, saveUser, clearUser } from "./LoginModal.jsx";

export default function App() {
  const [view, setView] = useState("landing"); // landing | crop | address | loading | result | check
  const [crop, setCrop] = useState(null);
  const [address, setAddress] = useState(null);
  const [result, setResult] = useState(null);
  const [checkPrefill, setCheckPrefill] = useState({ microbe: "", crop: "" });

  // 데모 로그인 상태 (LoginModal 참고 — 지금은 브라우저 저장, 추후 실제 인증으로 교체)
  const [user, setUser] = useState(loadUser);
  const [showLogin, setShowLogin] = useState(false);

  function handleLogin(u) {
    setUser(u);
    saveUser(u);
    setShowLogin(false);
  }
  function handleLogout() {
    setUser(null);
    clearUser();
  }

  function goHome() {
    setView("landing");
    window.scrollTo(0, 0);
  }

  function startRecommend() {
    setCrop(null);
    setAddress(null);
    setView("crop");
  }

  function startCheck() {
    setCheckPrefill({ microbe: "", crop: "" });
    setView("check");
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
      case "crop":
        return <CropSelect crop={crop} onSelect={setCrop} onBack={goHome} onNext={() => setView("address")} />;
      case "address":
        return (
          <AddressInput
            address={address}
            onSelect={setAddress}
            onBack={() => setView("crop")}
            onNext={() => setView("loading")}
          />
        );
      case "loading":
        return <LoadingScreen crop={crop} address={address} onDone={handleLoadingDone} />;
      case "result":
        return (
          <ResultScreen result={result} crop={crop} address={address} onCheck={goToCheckFromResult} onHome={goHome} />
        );
      case "check":
        return <CheckScreen prefill={checkPrefill} onBack={goHome} />;
      default:
        return (
          <MicrobeAiLandingPage
            onStartRecommend={startRecommend}
            onStartCheck={startCheck}
            user={user}
            onLoginClick={() => setShowLogin(true)}
            onLogout={handleLogout}
          />
        );
    }
  }

  return (
    <>
      {renderView()}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={handleLogin} />}
    </>
  );
}
