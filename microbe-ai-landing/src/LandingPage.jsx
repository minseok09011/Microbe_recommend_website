import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Sprout,
  Microscope,
  FlaskConical,
  BookOpen,
  CloudSun,
  Languages,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────
   레퍼런스(webee) 사이트의 "스크롤 시 fade-up" 패턴을 그대로 구현한
   IntersectionObserver 기반 reveal 래퍼. framer-motion 없이 Tailwind
   transition 유틸리티만으로 동일한 느낌을 낸다.
────────────────────────────────────────────────────────────── */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

/* 마우스를 따라 은은하게 빛나는 글로우 카드 (레퍼런스의 shader-card 모사) */
function GlowCard({ children, className = "", glow = "rgba(34,197,94,0.35)" }) {
  const cardRef = useRef(null);

  const handleMouseMove = (e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    card.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`group relative overflow-hidden rounded-2xl border border-stone-200 bg-white/70 backdrop-blur-xl shadow-sm ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), ${glow}, transparent 45%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function Eyebrow({ children, light = false }) {
  return (
    <p
      className={`text-xs tracking-widest uppercase mb-2 font-semibold ${
        light ? "text-white/70" : "text-emerald-700/70"
      }`}
    >
      {children}
    </p>
  );
}

function IconBox({ icon: Icon, className = "", iconClassName = "h-6 w-6 text-white" }) {
  return (
    <div className={`flex items-center justify-center rounded-xl flex-shrink-0 ${className}`}>
      <Icon className={iconClassName} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   1. HERO
────────────────────────────────────────────────────────────── */
function Hero({ onStartRecommend, onStartCheck, user, onLoginClick, onLogout, onMyRecords }) {
  const stats = [{ value: "1,764편", label: "A급 논문 학습" }, { value: "4종", label: "공공 데이터 활용" }, { value: "48종", label: "추천 가능한 미생물" }];

  return (
    <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
      {/* 배경 이미지 — 농경지 항공 사진 */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(img/dan-meyers-IQVFVH0ajag-unsplash.jpg)" }}
      />
      <Sprout className="absolute -bottom-10 -left-10 h-72 w-72 text-emerald-700/20 rotate-12" />
      <Microscope className="absolute -top-10 -right-10 h-72 w-72 text-amber-500/10 -rotate-12" />
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

      <SiteHeader user={user} onLoginClick={onLoginClick} onLogout={onLogout} onMyRecords={onMyRecords} />

      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <Reveal>
          <p className="text-white/80 text-lg md:text-xl tracking-widest uppercase mb-6">
            AI-Powered Soil Intelligence
          </p>
        </Reveal>

        <Reveal delay={100}>
          <h1
            className="text-2xl md:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight"
            style={{ textShadow: "0 4px 30px rgba(0,0,0,0.5)" }}
          >
            AI 기반 토양 맞춤형{" "}
            <span className="text-amber-400">미생물 처방</span>으로
            <br />
            내 밭에 딱 맞는 <span className="text-amber-400">해답</span>을 찾다
          </h1>
        </Reveal>

        <Reveal delay={150}>
          <p className="text-white/80 text-base md:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            흙토람 토양 데이터와 최우선 학술 논문 8,082편을 학습한 AI가 당신의
            농장을 위한 최적의 미생물 솔루션을 제공합니다.
          </p>
        </Reveal>

        <Reveal delay={200}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            <div className="flex items-center gap-6 text-white/90">
              {stats.map((s, i) => (
                <React.Fragment key={s.label}>
                  {i > 0 && <div className="w-px h-12 bg-white/30" />}
                  <div className="text-center min-w-[100px]">
                    <p className="text-xl md:text-3xl font-bold text-amber-400 whitespace-nowrap">{s.value}</p>
                    <p className="text-xs md:text-sm text-white/70 whitespace-nowrap">{s.label}</p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={250}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onStartRecommend}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap bg-white/15 backdrop-blur-sm border-2 border-white text-white hover:bg-white/25 font-bold w-52 py-4 text-base rounded-md transition-colors"
            >
              미생물 추천받기
            </button>
            <button
              onClick={onStartCheck}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap bg-white/15 backdrop-blur-sm border-2 border-white text-white hover:bg-white/25 font-bold w-52 py-4 text-base rounded-md transition-colors"
            >
              살포 가능 확인
            </button>
          </div>
        </Reveal>

      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
        <div className="flex flex-col items-center gap-2 animate-bounce">
          <span className="text-white/60 text-sm tracking-widest uppercase">Scroll Down</span>
          <ChevronDown className="h-6 w-6 text-white/60" />
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   1-1. 페이지 최상단 브랜드 로고 바
────────────────────────────────────────────────────────────── */
function SiteHeader({ user, onLoginClick, onLogout, onMyRecords }) {
  return (
    <header className="absolute top-0 left-0 right-0 z-20 px-4 pt-6 sm:pt-8">
      <div className="flex items-center justify-center gap-2">
        <span className="text-2xl sm:text-3xl font-bold text-white" style={{ textShadow: "0 2px 16px rgba(0,0,0,0.5)" }}>
          TOBio 토비오
        </span>
      </div>

      {/* 우상단 로그인 / 로그인 상태 */}
      <div className="absolute right-4 top-6 sm:top-8 flex items-center gap-2">
        {user ? (
          <>
            <span className="hidden sm:inline text-sm font-semibold text-white/90" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>
              {user.name}님
            </span>
            {onMyRecords && (
              <button
                onClick={onMyRecords}
                className="rounded-md border border-white/50 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                내 기록
              </button>
            )}
            <button
              onClick={onLogout}
              className="rounded-md border border-white/50 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              로그아웃
            </button>
          </>
        ) : (
          <button
            onClick={onLoginClick}
            className="rounded-md border border-white/50 bg-white/10 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            로그인
          </button>
        )}
      </div>
    </header>
  );
}

/* ──────────────────────────────────────────────────────────────
   3. OUR SOLUTION — 5단계 타임라인
────────────────────────────────────────────────────────────── */
function OurSolution() {
  const steps = [
    { step: "STEP.1", title: "농지 정보 입력", desc: "작물, 위치, 목적 입력" },
    { step: "STEP.2", title: "다차원 데이터 수집", desc: "흙토람 화학/물리성 및 기상청 API 연동" },
    { step: "STEP.3", title: "AI 논문 분석", desc: "Gemini 임베딩 기반 최우선 논문 매칭" },
    { step: "STEP.4", title: "맞춤형 처방", desc: "병해 예방/생장 촉진 미생물 카드 제공" },
    { step: "STEP.5", title: "살포 일정 관리", desc: "날씨 기반 살포 신호등 및 사후 관리" },
  ];

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-16">
          <Eyebrow>OUR SOLUTION</Eyebrow>
          <h2 className="text-3xl md:text-4xl font-bold text-stone-900">
            One-Stop
            <br />
            Microbe Solution
          </h2>
        </Reveal>

        <Reveal delay={100}>
          <div className="relative">
            <div className="flex items-center gap-2 mb-8">
              <div className="w-4 h-4 rounded-full bg-emerald-700" />
              <span className="text-sm font-semibold text-stone-900">
                TOBIO ONE-STOP SOLUTION
              </span>
            </div>

            <div className="relative">
              <div className="absolute top-4 left-0 right-0 h-0.5 bg-stone-200 hidden md:block" />
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {steps.map((s) => (
                  <div key={s.step} className="relative flex flex-col items-center text-center">
                    <div className="w-3 h-3 rounded-full bg-emerald-700 mb-4 relative z-10" />
                    <p className="text-xs text-stone-400 font-medium mb-1">{s.step}</p>
                    <p className="text-sm font-semibold text-stone-900 mb-1">{s.title}</p>
                    <p className="text-xs text-stone-500">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   4. CORE FEATURES — 2x4 카드 (이미지 자리는 그라디언트+아이콘 placeholder)
────────────────────────────────────────────────────────────── */
function CoreFeatures() {
  const features = [
    {
      title: "정밀 토양 분석",
      icon: FlaskConical,
      gradient: "from-emerald-600/80 to-emerald-400/40",
      desc: "pH, 유기물, 배수 등급 등 27가지 흙토람 데이터를 기반으로 내 밭의 흙 상태를 완벽히 진단합니다.",
    },
    {
      title: "AI 학술 논문 처방",
      icon: BookOpen,
      gradient: "from-amber-600/80 to-amber-400/40",
      desc: "검증된 A급 최상위 논문 1,764편을 학습한 RAG 시스템이 환각(Hallucination) 없이 정확한 미생물을 추천합니다.",
    },
    {
      title: "기상 연동 살포 신호등",
      icon: CloudSun,
      gradient: "from-sky-600/80 to-sky-400/40",
      desc: "농업 기상 10분 데이터와 일기예보를 결합하여 미생물을 뿌리기 가장 좋은 타이밍을 알려줍니다.",
    },
    {
      title: "농민 맞춤형 UI",
      icon: Languages,
      gradient: "from-emerald-600/80 to-emerald-400/40",
      desc: "어려운 학술 용어 대신 '토마토, 병 막기, 미생물 약제' 등 직관적인 농민의 언어로 번역되어 제공됩니다.",
    },
  ];

  return (
    <section className="relative bg-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <Reveal className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-stone-900 mb-2">핵심 기능</h2>
          <p className="text-stone-500">토비오와 함께 더 확실한 토양 관리를 경험하세요</p>
        </Reveal>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <div className="group rounded-xl bg-stone-50 border border-stone-200/70 overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <div className="relative h-16 overflow-hidden bg-gradient-to-br from-stone-200 to-stone-100 flex items-center justify-center">
                  <f.icon className="h-8 w-8 text-stone-400" />
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <IconBox
                      icon={f.icon}
                      className={`w-8 h-8 bg-gradient-to-br ${f.gradient}`}
                      iconClassName="h-4 w-4 text-white"
                    />
                    <h3 className="text-sm font-semibold text-stone-900">{f.title}</h3>
                  </div>
                  <div className="overflow-hidden max-h-0 opacity-0 group-hover:max-h-40 group-hover:opacity-100 group-hover:mt-2 transition-all duration-300">
                    <p className="text-stone-500 text-xs leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   5. SERVICE SHOWCASE — 서비스 미리보기 캐러셀
────────────────────────────────────────────────────────────── */
function ServiceShowcase() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);

  const [phase, setPhase] = useState("visible"); // visible | slideOut | hidden | fadeIn

  function goTo(next) {
    if (phase !== "visible" || next === current) return;
    setDirection(next > current ? 1 : -1);
    setPhase("slideOut");
    setTimeout(() => {
      setCurrent(next);
      setPhase("hidden");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase("fadeIn"));
      });
    }, 400);
  }

  const slides = [
    {
      title: "AI 맞춤 미생물 추천",
      desc: "주소와 작물만 입력하면, 실시간 토양·기상 데이터를 분석해 A급 논문 1,764편 근거의 최적 미생물을 추천합니다.",
      card: (
        <div className="bg-white rounded-2xl shadow-md p-5 text-left w-full max-w-xs mx-auto font-medium" style={{ minHeight: 420 }}>
          <div className="bg-gradient-to-br from-emerald-800 to-emerald-600 rounded-xl p-4 mb-4 text-white">
            <p className="text-xs uppercase tracking-widest text-white/70 mb-1">AI Recommendation</p>
            <p className="font-bold text-base">토비오의 미생물 추천</p>
            <p className="text-xs text-white/80 mt-1">작물: 양파 | 농경지: 전남 화순군</p>
          </div>
          <div className="flex gap-2 mb-3">
            <div className="flex-1 bg-stone-100 rounded-lg px-2.5 py-2">
              <p className="text-xs font-bold text-stone-500">지역 추정값</p>
              <p className="text-[11px] text-stone-400">토양 통계 기반</p>
            </div>
            <div className="bg-emerald-50 rounded-lg px-2.5 py-2 text-center">
              <p className="text-xs font-bold text-emerald-700">근거 강도</p>
              <p className="text-amber-500 text-sm">★★★★</p>
            </div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3.5">
            <p className="text-xs font-bold text-emerald-800 mb-1.5">상황 설명</p>
            <p className="text-[11px] text-emerald-700 leading-relaxed">내 밭의 토양 산도, 유기물, 수분, 기온 등을 종합 분석하여 전문 용어 없이 농민이 바로 이해할 수 있는 쉬운 말로 설명해드립니다. 논문 근거가 필요하면 "더보기"에서 학술 인용까지 확인할 수 있어요.</p>
          </div>
        </div>
      ),
    },
    {
      title: "실제 판매처 바로 연결",
      desc: "추천된 미생물의 등록 제품 수, 가격대, 연락처까지 한눈에 비교하고 온라인 구매로 바로 연결됩니다.",
      card: (
        <div className="bg-white rounded-2xl shadow-md p-5 text-left w-full max-w-xs mx-auto font-medium" style={{ minHeight: 420 }}>
          <div className="bg-amber-400 rounded-t-lg px-3 py-2.5 flex items-center gap-1.5">
            <span className="text-sm font-bold text-black">토비오의 최고 추천</span>
          </div>
          <div className="border border-stone-200 border-t-0 rounded-b-lg p-3 mb-3">
            <p className="font-bold text-base italic text-stone-900 mb-2">Bacillus megaterium</p>
            <div className="flex gap-1.5 mb-2">
              <span className="text-[11px] font-bold bg-emerald-600 text-white rounded-full px-2.5 py-0.5">농약/비료 등록됨</span>
              <span className="text-[11px] font-bold bg-stone-100 text-stone-600 rounded-full px-2.5 py-0.5">등록 제품 2개</span>
            </div>
          </div>
          <p className="text-xs font-bold text-stone-500 mb-2">구매 가능 판매처 (2곳)</p>
          {[
            { name: "XXX코리아", product: "토양미생물제제", price: "8,000원/500g", tel: "042-000-0000" },
            { name: "XXX바이오텍", product: "미생물 제제", price: "25,000원/500mL", tel: "033-000-0000" },
          ].map((v) => (
            <div key={v.name} className="border-l-4 border-l-amber-400 border border-stone-200 rounded-r-lg px-2.5 py-2.5 mb-3 bg-stone-50">
              <p className="text-sm font-bold text-stone-800">{v.name}</p>
              <p className="text-[11px] text-stone-500">{v.product}</p>
              <p className="text-[11px] text-stone-500">{v.price}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="inline-flex items-center gap-0.5 text-[11px] text-stone-600 border border-stone-300 rounded px-2 py-0.5 bg-white">📞 {v.tel}</span>
                <span className="inline-flex items-center gap-0.5 text-[11px] text-white bg-emerald-700 rounded px-2 py-0.5">🛒 온라인 구매</span>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "살포 안전일 자동 계산",
      desc: "최근 뿌린 농약·비료를 입력하면, 미생물이 죽지 않는 안전한 살포 시기를 신호등으로 알려드립니다.",
      card: (
        <div className="bg-white rounded-2xl shadow-md p-5 text-left w-full max-w-xs mx-auto font-medium" style={{ minHeight: 420 }}>
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-center mb-3">
            <p className="text-2xl mb-1">🟡</p>
            <p className="font-bold text-amber-700 text-base">조금 더 기다리는 게 좋아요</p>
            <p className="text-sm text-stone-700 mt-1">권장 살포 가능일: 2026-07-12</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-lg p-3 mb-2">
            <p className="text-xs font-bold text-stone-500 mb-1.5">가장 영향이 큰 자재</p>
            <p className="text-sm text-stone-700">🔴 <strong>석회황</strong> (석회유황합제) — 14일</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-lg p-3">
            <p className="text-xs font-bold text-stone-500 mb-1.5">자재별 안전 해제일</p>
            <div className="flex justify-between text-xs text-stone-600 mb-1">
              <span>🔴 석회황</span><span>2026-07-12 (14일)</span>
            </div>
            <div className="flex justify-between text-xs text-stone-600">
              <span>🟢 다트롤</span><span>2026-06-28 (0일)</span>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section className="py-24 bg-stone-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-16">
          <Eyebrow>SERVICE PREVIEW</Eyebrow>
          <h2 className="text-3xl md:text-4xl font-bold text-stone-900">
            이런 결과를 받아볼 수 있어요
          </h2>
        </Reveal>

        <Reveal delay={100}>
          <div className="max-w-sm mx-auto" style={{ minHeight: 480 }}>
            <div
              style={{
                opacity: phase === "visible" || phase === "fadeIn" ? 1 : 0,
                transform: phase === "slideOut"
                  ? `translateX(${direction * 80}px)`
                  : "translateX(0)",
                transition: phase === "slideOut"
                  ? "opacity 400ms ease-in-out, transform 400ms ease-in-out"
                  : phase === "fadeIn"
                  ? "opacity 500ms ease-in-out"
                  : "none",
              }}
              onTransitionEnd={() => { if (phase === "fadeIn") setPhase("visible"); }}
            >
              {slides[current].card}
            </div>
          </div>

          <div className="mt-4 text-center">
            <h3 className="text-lg font-bold text-stone-900 mb-2">{slides[current].title}</h3>
            <p className="text-sm text-stone-500 leading-relaxed max-w-md mx-auto">{slides[current].desc}</p>
          </div>

          <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() => goTo((current - 1 + slides.length) % slides.length)}
                className="w-10 h-10 rounded-full bg-white border border-stone-200 shadow-sm flex items-center justify-center text-stone-500 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
              >
                &larr;
              </button>
              <div className="flex gap-2">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      i === current ? "bg-emerald-700" : "bg-stone-300"
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() => goTo((current + 1) % slides.length)}
                className="w-10 h-10 rounded-full bg-white border border-stone-200 shadow-sm flex items-center justify-center text-stone-500 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
              >
                &rarr;
              </button>
            </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   9. FOOTER
────────────────────────────────────────────────────────────── */
function ContactFooter() {
  return (
    <>
      <footer className="py-12 bg-stone-100 border-t border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center overflow-hidden">
                  <img src="img/tobio.png" alt="토비오" className="h-7 w-7 object-cover object-top" />
                </div>
                <span className="font-semibold text-stone-900">TOBio 토비오</span>
              </div>
              <p className="text-sm text-stone-500">2026 TOBio(토비오). AI 기반 토양 맞춤형 미생물 추천 플랫폼</p>
            </div>
          </Reveal>
        </div>
      </footer>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
   메인 페이지 — 마우스 글로우 커서까지 레퍼런스 그대로 재현
────────────────────────────────────────────────────────────── */
export default function MicrobeAiLandingPage({ onStartRecommend, onStartCheck, user, onLoginClick, onLogout, onMyRecords }) {
  const glowRef = useRef(null);

  useEffect(() => {
    const handleMove = (e) => {
      if (glowRef.current) {
        glowRef.current.style.background = `radial-gradient(60px circle at ${e.clientX}px ${e.clientY}px, rgba(16,185,129,0.35), transparent 60%)`;
      }
    };
    window.addEventListener("mousemove", handleMove);
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "none";
    return () => {
      window.removeEventListener("mousemove", handleMove);
      document.body.style.cursor = prevCursor;
    };
  }, []);

  return (
    <div className="min-h-screen relative" style={{ fontFamily: "'Pretendard', -apple-system, system-ui, sans-serif" }}>
      <div ref={glowRef} className="pointer-events-none fixed inset-0 z-50 transition-all duration-150" />

      <Hero
        onStartRecommend={onStartRecommend}
        onStartCheck={onStartCheck}
        user={user}
        onLoginClick={onLoginClick}
        onLogout={onLogout}
        onMyRecords={onMyRecords}
      />
      <OurSolution />
      <ServiceShowcase />
      <CoreFeatures />
      <ContactFooter />
    </div>
  );
}
