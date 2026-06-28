import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Sprout, Microscope } from "lucide-react";

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

/* ──────────────────────────────────────────────────────────────
   1. HERO
────────────────────────────────────────────────────────────── */
function Hero({ onStartRecommend, onStartCheck, user, onLoginClick, onLogout, onMyRecords }) {
  const stats = [{ value: "1,764편", label: "A급 논문 학습" }];

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
                  <div className="text-center">
                    <p className="text-xl md:text-3xl font-bold text-amber-400 whitespace-nowrap">{s.value}</p>
                    <p className="text-xs md:text-sm text-white/70">{s.label}</p>
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
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap bg-amber-500 hover:bg-amber-400 text-black font-semibold px-10 py-4 text-base rounded-md transition-colors"
            >
              미생물 추천받기
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              onClick={onStartCheck}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap bg-transparent border-2 border-white text-white hover:bg-white/10 px-10 py-4 text-base rounded-md transition-colors"
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
      <ContactFooter />
    </div>
  );
}
