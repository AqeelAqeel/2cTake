import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../state/authStore'
import {
  Upload, Link2, FileText, Video, Clock,
  PenTool, ArrowRight, Play, Check,
  ChevronDown, Eye, Sparkles, Users,
} from 'lucide-react'

/* ────────────────────────────────────────────
   Scroll-reveal hook
   ──────────────────────────────────────────── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el) } },
      { threshold },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

/* ────────────────────────────────────────────
   Reveal wrapper
   ──────────────────────────────────────────── */
function Reveal({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string
}) {
  const { ref, visible } = useInView(0.12)
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/* ────────────────────────────────────────────
   App window mockup shell
   ──────────────────────────────────────────── */
function MockupWindow({ title, children, className = '' }: {
  title: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`rounded-xl border border-white/10 bg-[#0C0C0C] overflow-hidden shadow-2xl ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-[#0A0A0A]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        </div>
        <span className="text-[11px] text-gray-500 ml-2 font-medium">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

/* ────────────────────────────────────────────
   Google SVG icon (from Login page)
   ──────────────────────────────────────────── */
function GoogleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

/* ────────────────────────────────────────────
   Brand text component
   ──────────────────────────────────────────── */
function BrandText({ className = '' }: { className?: string }) {
  return (
    <span className={className}>
      <span className="text-goblin-pink">feedback</span>{' '}
      <span className="text-goblin-green font-black">goblin</span>
    </span>
  )
}

/* ────────────────────────────────────────────
   CTA button
   ──────────────────────────────────────────── */
function CTAButton({ onClick, children, size = 'lg' }: {
  onClick: () => void; children: React.ReactNode; size?: 'md' | 'lg'
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative inline-flex items-center gap-2 font-semibold text-white rounded-xl transition-all
        bg-gradient-to-r from-goblin-green to-goblin-pink
        hover:shadow-[0_0_32px_rgba(29,185,84,0.3),0_0_32px_rgba(255,20,147,0.3)]
        hover:scale-[1.02] active:scale-[0.98]
        ${size === 'lg' ? 'px-8 py-4 text-lg' : 'px-6 py-3 text-base'}`}
    >
      {children}
    </button>
  )
}


/* ═══════════════════════════════════════════════
   MOCKUP COMPONENTS
   ═══════════════════════════════════════════════ */

function MockupUpload() {
  return (
    <MockupWindow title="New Session">
      <div className="border-2 border-dashed border-white/10 rounded-lg p-8 text-center mb-5">
        <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">Drop your PDF, design, or doc</p>
        <p className="text-gray-600 text-xs mt-1">or click to browse</p>
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3">
        <FileText className="w-5 h-5 text-goblin-pink" />
        <div className="min-w-0">
          <p className="text-sm text-white truncate">Q3-Brand-Deck.pdf</p>
          <p className="text-xs text-gray-500">2.4 MB</p>
        </div>
        <Check className="w-4 h-4 text-goblin-green ml-auto shrink-0" />
      </div>
    </MockupWindow>
  )
}

function MockupShare() {
  return (
    <MockupWindow title="Session Created">
      <div className="text-center mb-5">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-goblin-green-dim mb-3">
          <Check className="w-6 h-6 text-goblin-green" />
        </div>
        <p className="text-white font-medium">Your review link is ready</p>
      </div>
      <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-3">
        <Link2 className="w-4 h-4 text-gray-500 shrink-0" />
        <span className="text-sm text-gray-300 truncate font-mono">fbgoblin.app/review/a8x3kw</span>
        <button className="ml-auto shrink-0 text-xs bg-goblin-green text-black font-semibold px-3 py-1.5 rounded-md">
          Copy
        </button>
      </div>
      <p className="text-xs text-gray-500 text-center mt-4">
        Reviewers don't need an account
      </p>
    </MockupWindow>
  )
}

function MockupReview() {
  return (
    <MockupWindow title="Recording — Q3 Brand Deck">
      <div className="grid grid-cols-5 gap-3">
        {/* Artifact with annotations */}
        <div className="col-span-3 rounded-lg bg-white/5 p-4 relative min-h-[140px]">
          <div className="space-y-2">
            {[85, 70, 90, 60, 95, 75].map((w, i) => (
              <div key={i} className="h-1.5 bg-white/8 rounded" style={{ width: `${w}%` }} />
            ))}
          </div>
          {/* Annotation marks */}
          <div className="absolute top-6 right-6 w-14 h-7 border-2 border-goblin-pink rounded-sm opacity-80" />
          <svg className="absolute bottom-8 left-6 opacity-80" width="50" height="24">
            <path d="M0,20 Q12,0 25,12 T50,8" stroke="#1DB954" strokeWidth="2" fill="none" />
          </svg>
          <div className="absolute bottom-3 right-3">
            <PenTool className="w-3.5 h-3.5 text-goblin-pink/60" />
          </div>
        </div>
        {/* Camera + controls */}
        <div className="col-span-2 flex flex-col gap-3">
          <div className="aspect-[4/3] rounded-lg bg-white/5 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-goblin-pink/30 to-goblin-green/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-white/50" />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse-dot" />
            <span className="text-[11px] text-red-400 font-semibold">REC</span>
            <span className="text-[11px] text-gray-400 ml-1 font-mono">03:42</span>
          </div>
        </div>
      </div>
    </MockupWindow>
  )
}

function MockupResults() {
  return (
    <MockupWindow title="Q3 Brand Deck — 3 recordings">
      <div className="grid grid-cols-5 gap-3">
        {/* Video player + transcript */}
        <div className="col-span-3 space-y-3">
          <div className="aspect-video rounded-lg bg-white/5 relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <Play className="w-4 h-4 text-white ml-0.5" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
              <div className="h-full w-2/5 bg-goblin-pink rounded-r" />
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 space-y-1.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Transcript</p>
            {[
              ['0:00', '"So first thing I notice is the headline…"'],
              ['0:15', '"This color palette feels a bit off here…"'],
              ['0:34', '"Love this section though, really strong…"'],
            ].map(([t, text]) => (
              <div key={t} className="flex gap-2">
                <span className="text-[11px] text-goblin-green font-mono shrink-0">{t}</span>
                <span className="text-[11px] text-gray-400">{text}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Recordings list */}
        <div className="col-span-2 space-y-2">
          {[
            { name: 'Sarah J.', dur: '4:32', init: 'S' },
            { name: 'Mike R.', dur: '2:15', init: 'M' },
            { name: 'Alex C.', dur: '6:03', init: 'A' },
          ].map((r) => (
            <div key={r.name} className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-goblin-pink/50 to-goblin-green/50 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {r.init}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white truncate">{r.name}</p>
                <p className="text-[10px] text-gray-500">{r.dur}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MockupWindow>
  )
}


/* ═══════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════ */
export function LandingPage() {
  const { user, loading, signInWithGoogle } = useAuthStore()
  const [scrolled, setScrolled] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const [chatVisible, setChatVisible] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('landing-smooth')
    return () => document.documentElement.classList.remove('landing-smooth')
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Chat section intersection observer
  useEffect(() => {
    const el = chatRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setChatVisible(true); obs.unobserve(el) } },
      { threshold: 0.2 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#050505]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-goblin-green border-t-transparent" />
      </div>
    )
  }

  if (user) return <Navigate to="/" replace />

  const chatMessages: { text: string; right: boolean; gap?: string }[] = [
    { text: 'hey, can you review this deck before thursday?', right: true },
    { text: 'sure thing \ud83d\udc4d', right: false },
    { text: '', right: false, gap: '4 days later\u2026' },
    { text: 'hey just checking in \u2014 did you get a chance?', right: true },
    { text: 'oh shoot, been slammed. will look tonight', right: false },
    { text: '', right: false, gap: '1 week later\u2026' },
    { text: 'any thoughts? presentation is tomorrow \ud83d\ude05', right: true },
    { text: 'just looked! it\u2019s good. maybe change the font on slide 3?', right: false },
  ]

  const features = [
    { icon: Video, title: 'Video recordings', desc: 'Watch real, unfiltered reactions to your work \u2014 facial expressions and all.' },
    { icon: Clock, title: 'Timestamped transcripts', desc: 'Every word automatically transcribed and time-coded. Click to jump.' },
    { icon: PenTool, title: 'Visual annotations', desc: 'See exactly what they circled, underlined, and pointed at \u2014 synced to the video timeline.' },
    { icon: Sparkles, title: 'Stream of consciousness', desc: 'Raw, honest, in-the-moment reactions. Not polished, filtered email feedback.' },
    { icon: Users, title: 'Zero friction for reviewers', desc: 'No account, no app install, no forms. Just click a link and talk.' },
    { icon: Eye, title: 'See it all', desc: 'Transcripts, timestamps, video, markups \u2014 everything in one place, ready when you are.' },
  ]

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-x-hidden">

      {/* ─── NAV ─── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#050505]/80 backdrop-blur-xl border-b border-white/5' : ''}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <BrandText className="text-xl font-bold" />
          <button
            onClick={signInWithGoogle}
            className="flex items-center gap-2 text-sm font-medium text-gray-300 border border-white/10 rounded-lg px-4 py-2 hover:bg-white/5 hover:border-white/20 transition-all"
          >
            <GoogleIcon className="h-4 w-4" />
            Sign in
          </button>
        </div>
      </nav>


      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 landing-grid-bg">
        {/* Glow orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-goblin-pink/15 rounded-full blur-[160px] animate-glow-breathe" />
          <div className="absolute top-1/3 right-1/5 w-[400px] h-[400px] bg-goblin-green/15 rounded-full blur-[140px] animate-glow-breathe" style={{ animationDelay: '2s' }} />
        </div>

        <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
          {/* Brand */}
          <div className="mb-8">
            <BrandText className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tight" />
          </div>

          {/* Tagline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight">
            Real feedback in <span className="text-goblin-green">5 minutes</span>,<br className="hidden sm:block" />
            {' '}not 5 follow-ups.
          </h1>

          {/* Description */}
          <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Upload your work. Send a link. Your reviewers hit record, react naturally, and mark things up
            — all captured with video, transcripts, and timestamps.
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <CTAButton onClick={signInWithGoogle}>
              Get started free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </CTAButton>
            <p className="text-sm text-gray-500">No credit card required</p>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <ChevronDown className="w-6 h-6 text-gray-600 animate-bounce" />
        </div>
      </section>


      {/* ─── CHAT BUBBLES — "Sound familiar?" ─── */}
      <section className="py-24 md:py-32 px-6">
        <Reveal>
          <p className="text-center text-xs uppercase tracking-[0.2em] text-gray-500 mb-16 font-medium">
            Sound familiar?
          </p>
        </Reveal>

        <div ref={chatRef} className="max-w-lg mx-auto space-y-4">
          {chatMessages.map((msg, i) => {
            if (msg.gap) {
              return (
                <div
                  key={i}
                  className={`text-center py-4 transition-all duration-500 ${chatVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                  style={{ transitionDelay: `${i * 250}ms` }}
                >
                  <span className="text-xs text-gray-600 bg-white/5 rounded-full px-4 py-1.5">{msg.gap}</span>
                </div>
              )
            }
            return (
              <div
                key={i}
                className={`flex ${msg.right ? 'justify-end' : 'justify-start'} transition-all duration-500 ${chatVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                style={{ transitionDelay: `${i * 250}ms` }}
              >
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.right
                    ? 'bg-goblin-pink/15 text-goblin-pink-light rounded-br-md'
                    : 'bg-white/8 text-gray-300 rounded-bl-md'
                }`}>
                  {msg.text}
                </div>
              </div>
            )
          })}
        </div>

        {/* Punchline */}
        <Reveal delay={200}>
          <div className="max-w-lg mx-auto mt-14 text-center">
            <p className="text-xl md:text-2xl text-gray-300 leading-relaxed">
              You waited <span className="text-goblin-pink font-bold">11 days</span> for{' '}
              <span className="italic text-gray-500">&ldquo;change the font on slide&nbsp;3.&rdquo;</span>
            </p>
          </div>
        </Reveal>
      </section>


      {/* ─── TRANSITION ─── */}
      <section className="py-16 md:py-24 px-6">
        <Reveal>
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              What if getting feedback was as easy as{' '}
              <span className="bg-gradient-to-r from-goblin-green to-goblin-pink bg-clip-text text-transparent">
                sending a link
              </span>?
            </h2>
          </div>
        </Reveal>
      </section>


      {/* ─── HOW IT WORKS ─── */}
      <section className="py-20 md:py-32 px-6">
        <Reveal>
          <p className="text-center text-xs uppercase tracking-[0.2em] text-gray-500 mb-4 font-medium">
            How it works
          </p>
          <h2 className="text-center text-3xl md:text-4xl font-bold text-white mb-20">
            Four steps. Zero headaches.
          </h2>
        </Reveal>

        <div className="max-w-5xl mx-auto space-y-24 md:space-y-32">

          {/* Step 1 — Upload */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <Reveal className="order-2 md:order-1">
              <div>
                <div className="inline-flex items-center gap-2 text-goblin-green text-xs font-semibold uppercase tracking-widest mb-4">
                  <span className="w-6 h-6 rounded-full bg-goblin-green/15 flex items-center justify-center text-[11px]">1</span>
                  Upload
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Drop in whatever you need feedback on
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  PDFs, images, slide decks, documents — just drag it in. You can also paste a Google Docs or Google Slides link and we'll handle the rest.
                </p>
              </div>
            </Reveal>
            <Reveal delay={150} className="order-1 md:order-2">
              <div className="animate-float">
                <MockupUpload />
              </div>
            </Reveal>
          </div>

          {/* Step 2 — Share */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <Reveal delay={150} className="order-1">
              <div className="animate-float-delayed">
                <MockupShare />
              </div>
            </Reveal>
            <Reveal className="order-2">
              <div>
                <div className="inline-flex items-center gap-2 text-goblin-pink text-xs font-semibold uppercase tracking-widest mb-4">
                  <span className="w-6 h-6 rounded-full bg-goblin-pink/15 flex items-center justify-center text-[11px]">2</span>
                  Share
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Send a magic link to your reviewers
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  One link. No sign-ups. No app downloads. Your reviewers click, and they're in. It's that simple. You can send it over Slack, email, text — whatever.
                </p>
              </div>
            </Reveal>
          </div>

          {/* Step 3 — Review */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <Reveal className="order-2 md:order-1">
              <div>
                <div className="inline-flex items-center gap-2 text-goblin-green text-xs font-semibold uppercase tracking-widest mb-4">
                  <span className="w-6 h-6 rounded-full bg-goblin-green/15 flex items-center justify-center text-[11px]">3</span>
                  Review
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  They hit record and just… talk
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Stream of consciousness. No forms, no structured questions. They see your work, react naturally, draw on it, circle things, point stuff out. All while being recorded. It takes them 5 minutes and saves you weeks of back-and-forth.
                </p>
              </div>
            </Reveal>
            <Reveal delay={150} className="order-1 md:order-2">
              <div className="animate-float">
                <MockupReview />
              </div>
            </Reveal>
          </div>

          {/* Step 4 — Results */}
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <Reveal delay={150} className="order-1">
              <div className="animate-float-delayed">
                <MockupResults />
              </div>
            </Reveal>
            <Reveal className="order-2">
              <div>
                <div className="inline-flex items-center gap-2 text-goblin-pink text-xs font-semibold uppercase tracking-widest mb-4">
                  <span className="w-6 h-6 rounded-full bg-goblin-pink/15 flex items-center justify-center text-[11px]">4</span>
                  Collect
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Get transcripts, timestamps, and video
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Every recording lands in your dashboard with a full transcript, timestamped annotations synced to the video, and the raw footage of your reviewers reacting. Click a timestamp, jump to that moment. It's all there.
                </p>
              </div>
            </Reveal>
          </div>

        </div>
      </section>


      {/* ─── WHAT YOU GET ─── */}
      <section className="py-20 md:py-32 px-6 relative">
        {/* Subtle background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-goblin-green/8 rounded-full blur-[160px]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto">
          <Reveal>
            <p className="text-center text-xs uppercase tracking-[0.2em] text-gray-500 mb-4 font-medium">
              What you get
            </p>
            <h2 className="text-center text-3xl md:text-4xl font-bold text-white mb-16">
              Everything. All of it. Automatically.
            </h2>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <div className="group rounded-xl border border-white/5 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/10 transition-all h-full">
                  <f.icon className="w-6 h-6 text-goblin-green mb-4 group-hover:text-goblin-pink transition-colors" />
                  <h3 className="text-white font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* ─── FRICTION CALLOUT ─── */}
      <section className="py-16 md:py-24 px-6">
        <Reveal>
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-lg md:text-xl text-gray-400 leading-relaxed">
              <span className="text-goblin-pink font-semibold">Your reviewers will thank you.</span>{' '}
              No accounts to create. No apps to download. No confusing interfaces. They click a link, hit record, and talk. That's it. You just made giving feedback the easiest part of their day.
            </p>
          </div>
        </Reveal>
      </section>


      {/* ─── FINAL CTA ─── */}
      <section className="py-24 md:py-36 px-6 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] bg-goblin-pink/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 right-1/3 w-[300px] h-[300px] bg-goblin-green/10 rounded-full blur-[120px]" />
        </div>

        <Reveal>
          <div className="relative z-10 max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
              Ready to summon<br />
              the <span className="text-goblin-green font-black">goblin</span>?
            </h2>
            <p className="text-gray-400 text-lg mb-10">
              Stop chasing people for feedback. Let them give it on their own terms.
            </p>
            <CTAButton onClick={signInWithGoogle} size="lg">
              <GoogleIcon className="h-5 w-5" />
              Get started with Google
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </CTAButton>
            <p className="mt-6 text-sm text-gray-500">
              Free to use. Takes 30 seconds to set up.
            </p>
          </div>
        </Reveal>
      </section>


      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandText className="text-sm font-bold" />
          <p className="text-xs text-gray-600">
            Async video feedback for people who value their time.
          </p>
        </div>
      </footer>

    </div>
  )
}
