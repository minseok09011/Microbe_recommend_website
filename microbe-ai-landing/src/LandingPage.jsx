import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Sprout,
  FlaskConical,
  Microscope,
  ShieldCheck,
  BookOpen,
  CloudSun,
  TrendingUp,
  MessageSquare,
  Send,
  Mail,
  Phone,
  Users,
  Sparkles,
  Languages,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────
   레퍼런스(webee) 사이트의 "스크롤 시 fade-up" 패턴을 그대로 구현한
   IntersectionObserver 기반 reveal 래퍼. framer-motion 없이 Tailwind
   transition 유틸리티만으로 동일한 느낌을 낸다.
────────────────────────────────────────────────────────────── */
function Reveal({ children, className = "", delay = 0, as: Tag = "div" }) {
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
function Hero({ onStartRecommend, onStartCheck, user, onLoginClick, onLogout }) {
  const stats = [
    { value: "800+", label: "A급 논문 학습" },
    { value: "27종", label: "토양 상세 데이터 반영" },
    { value: "100%", label: "날씨 기반 살포 신호등" },
  ];

  return (
    <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
      {/* 영상 자리 — 토양 단면을 연상시키는 그라디언트 + 텍스처 placeholder */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-emerald-900 to-amber-900" />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.25) 0, transparent 45%), radial-gradient(circle at 80% 70%, rgba(217,119,6,0.35) 0, transparent 45%)",
        }}
      />
      <Sprout className="absolute -bottom-10 -left-10 h-72 w-72 text-emerald-700/20 rotate-12" />
      <Microscope className="absolute -top-10 -right-10 h-72 w-72 text-amber-500/10 -rotate-12" />
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

      <SiteHeader user={user} onLoginClick={onLoginClick} onLogout={onLogout} />

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
            흙토람 토양 데이터와 최우선 학술 논문 800편을 학습한 AI가 당신의
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
                    <p className="text-2xl md:text-3xl font-bold text-amber-400">{s.value}</p>
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
function SiteHeader({ user, onLoginClick, onLogout }) {
  return (
    <header className="absolute top-0 left-0 right-0 z-20 px-4 pt-6 sm:pt-8">
      <div className="flex items-center justify-center gap-2">
        <img src="img/tobio.png" alt="토비오" className="h-16 sm:h-20 w-auto object-contain drop-shadow-lg flex-shrink-0" />
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

              <div className="mt-8 flex justify-end">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-amber-600" />
                  <span className="text-sm font-semibold text-stone-900">CORE FEATURES</span>
                </div>
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
      desc: "검증된 A급 최상위 논문 800편을 학습한 RAG 시스템이 환각(Hallucination) 없이 정확한 미생물을 추천합니다.",
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
   6. DATA DASHBOARD — 통계 + 라인차트/레이더차트 목업
────────────────────────────────────────────────────────────── */
function LineChartMock() {
  // 최근 7일 토양/기온 트렌드를 흉내낸 손으로 좌표를 잡은 목업 SVG
  const tempPts = "0,70 40,62 80,66 120,50 160,46 200,38 240,30";
  const soilPts = "0,90 40,86 80,88 120,80 160,78 200,72 240,68";
  return (
    <div className="h-56 w-full">
      <svg viewBox="0 0 240 110" className="w-full h-full">
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="0" y1={20 + i * 25} x2="240" y2={20 + i * 25} stroke="#e7e5e4" strokeWidth="1" />
        ))}
        <polyline points={tempPts} fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" />
        <polyline points={soilPts} fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function RadarChartMock() {
  // 6축 레이더 차트 목업 (적정범위 vs 내 밭 현황)
  const center = 60;
  const ring = (r) =>
    [0, 60, 120, 180, 240, 300]
      .map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x = center + r * Math.sin(rad);
        const y = center - r * Math.cos(rad);
        return `${x},${y}`;
      })
      .join(" ");

  const labels = ["pH", "유기물", "배수", "칼슘", "질소", "인산"];
  const labelPos = (r) =>
    [0, 60, 120, 180, 240, 300].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return { x: center + r * Math.sin(rad), y: center - r * Math.cos(rad) };
    });

  return (
    <svg viewBox="0 0 120 120" className="w-full h-56">
      <polygon points={ring(48)} fill="none" stroke="#e7e5e4" strokeWidth="1" />
      <polygon points={ring(32)} fill="none" stroke="#e7e5e4" strokeWidth="1" />
      <polygon points={ring(16)} fill="none" stroke="#e7e5e4" strokeWidth="1" />
      <polygon points={ring(40)} fill="rgba(217,119,6,0.12)" stroke="#d97706" strokeWidth="1.5" strokeDasharray="3 3" />
      <polygon points="60,18 95,42 88,80 60,95 30,72 25,38" fill="rgba(4,120,87,0.25)" stroke="#047857" strokeWidth="2" />
      {labelPos(56).map((p, i) => (
        <text key={labels[i]} x={p.x} y={p.y} fontSize="7" textAnchor="middle" fill="#78716c">
          {labels[i]}
        </text>
      ))}
    </svg>
  );
}

function DataDashboard() {
  const stats = [
    { icon: TrendingUp, label: "추천 미생물 매칭률", value: "98%" },
    { icon: ShieldCheck, label: "병해 예방 예측률", value: "92%" },
    { icon: Sparkles, label: "처방 만족도", value: "95%" },
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold text-stone-900 mb-6">
              내 밭의 상태를 한눈에
              <br />
              파악하는 직관적인 대시보드
            </h2>
            <p className="text-lg text-stone-500 mb-8 leading-relaxed">
              토비오는 토양과 기상에서 수집된 데이터를 분석해 최적의 관리
              전략을 제안합니다. 적정 범위 대비 내 밭의 위치를 그래프로 바로
              확인하세요.
            </p>
            <div className="space-y-4">
              {stats.map((s, i) => (
                <Reveal key={s.label} delay={i * 80}>
                  <div className="flex items-center gap-4">
                    <IconBox icon={s.icon} className="w-10 h-10 bg-amber-100" iconClassName="h-5 w-5 text-amber-700" />
                    <div>
                      <p className="text-sm text-stone-500">{s.label}</p>
                      <p className="text-lg font-semibold text-stone-900">{s.value}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </Reveal>

          <Reveal delay={150}>
            <GlowCard className="p-6" glow="rgba(217,119,6,0.25)">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-900">최근 7일 기온·토양 온도 트렌드</h3>
                <span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold border border-stone-300">
                  Live
                </span>
              </div>
              <LineChartMock />
              <div className="mt-2 flex items-center justify-center gap-6 text-xs text-stone-500">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-600" />
                  <span>기온 (°C)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-700" />
                  <span>토양 온도 (°C)</span>
                </div>
              </div>

              <div className="mt-8 border-t border-stone-200 pt-6">
                <h3 className="text-sm font-semibold text-stone-900 mb-2 text-center">
                  토양 화학성 적정 범위 대비 내 밭 현황
                </h3>
                <RadarChartMock />
                <div className="mt-2 flex items-center justify-center gap-6 text-xs text-stone-500">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-700" />
                    <span>내 밭 현황</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2 border-amber-600 border-dashed bg-transparent" />
                    <span>적정 범위</span>
                  </div>
                </div>
              </div>
            </GlowCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   9. CONTACT & FOOTER
────────────────────────────────────────────────────────────── */
function ContactFooter() {
  const contacts = [
    { icon: Mail, title: "이메일 문의", sub: "일반 문의 및 기술 지원", value: "hello@tobio.kr" },
    { icon: Phone, title: "전화 문의", sub: "평일 09:00 - 18:00", value: "1588-0000" },
    { icon: Users, title: "제휴 문의", sub: "기업 및 단체 제휴", value: "partner@tobio.kr" },
  ];

  return (
    <>
      <section className="py-20 bg-white" id="contact">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-12">
            <span className="inline-flex items-center rounded-md bg-stone-100 text-stone-600 px-2.5 py-0.5 text-xs font-semibold mb-4">
              <MessageSquare className="h-4 w-4 mr-2" />
              문의하기
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-stone-900 mb-4">
              궁금한 점이 있으신가요?
            </h2>
            <p className="text-lg text-stone-500 max-w-2xl mx-auto">
              TOBio(토비오)에 대해 궁금한 점이나 제휴 문의가 있으시면 아래 양식을
              통해 연락해 주세요.
            </p>
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <Reveal>
              <div className="space-y-8">
                {contacts.map((c) => (
                  <div key={c.title} className="flex items-start gap-4">
                    <IconBox icon={c.icon} className="w-12 h-12 bg-emerald-700/10" iconClassName="h-6 w-6 text-emerald-700" />
                    <div>
                      <h3 className="font-semibold text-stone-900 mb-1">{c.title}</h3>
                      <p className="text-sm text-stone-500 mb-1">{c.sub}</p>
                      <p className="text-sm font-medium text-stone-900">{c.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 md:p-8">
                <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-stone-700">이름 *</label>
                      <input
                        className="flex h-10 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        placeholder="홍길동"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-stone-700">이메일 *</label>
                      <input
                        type="email"
                        className="flex h-10 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        placeholder="example@email.com"
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-stone-700">연락처</label>
                      <input
                        type="tel"
                        className="flex h-10 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        placeholder="010-1234-5678"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-stone-700">문의 유형 *</label>
                      <select className="flex h-10 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-500 focus:outline-none focus:ring-2 focus:ring-emerald-600">
                        <option>선택해주세요</option>
                        <option>서비스 이용 문의</option>
                        <option>제휴 문의</option>
                        <option>기타</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-700">문의 내용 *</label>
                    <textarea
                      className="flex w-full min-h-[120px] resize-none rounded-md border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      placeholder="문의하실 내용을 자세히 적어주세요."
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-medium px-4 py-3 transition-colors"
                  >
                    <Send className="h-4 w-4" />
                    문의 보내기
                  </button>
                </form>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

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
export default function MicrobeAiLandingPage({ onStartRecommend, onStartCheck, user, onLoginClick, onLogout }) {
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
      />
      <OurSolution />
      <CoreFeatures />
      <DataDashboard />
      <ContactFooter />
    </div>
  );
}
