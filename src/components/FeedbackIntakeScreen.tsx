import { useState, type ReactNode } from 'react'
import {
  User,
  PlayCircle,
  Mic,
  Video,
  EyeOff,
  FileText,
  ArrowRight,
  Volume2,
} from 'lucide-react'

interface FeedbackIntakeScreenProps {
  senderName: string
  documentName?: string
  onStart: () => void
}

// ─── Color config for themed sub-components ──────────────────────────────────

const colorConfig = {
  pink: {
    iconBg: 'linear-gradient(135deg, rgba(255,20,147,0.15), rgba(255,20,147,0.05))',
    iconBorder: 'rgba(255,20,147,0.18)',
    chipBg: 'rgba(255,20,147,0.12)',
    stroke: '#FF1493',
  },
  indigo: {
    iconBg: 'linear-gradient(135deg, rgba(129,140,248,0.15), rgba(129,140,248,0.05))',
    iconBorder: 'rgba(129,140,248,0.18)',
    chipBg: 'rgba(129,140,248,0.12)',
    stroke: '#818cf8',
  },
  green: {
    iconBg: 'linear-gradient(135deg, rgba(29,185,84,0.15), rgba(29,185,84,0.05))',
    iconBorder: 'rgba(29,185,84,0.18)',
    chipBg: 'rgba(29,185,84,0.12)',
    stroke: '#1DB954',
  },
} as const

type ThemeColor = keyof typeof colorConfig

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepItem({
  number,
  icon,
  color,
  title,
  description,
  delay,
}: {
  number: number
  icon: ReactNode
  color: ThemeColor
  title: string
  description: string
  delay: number
}) {
  const c = colorConfig[color]
  return (
    <div
      className="intake-fade-up flex items-center gap-4 p-4 rounded-2xl"
      style={{
        animationDelay: `${delay}s`,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="shrink-0 w-12 h-12 rounded-[14px] flex items-center justify-center relative"
        style={{
          background: c.iconBg,
          border: `1px solid ${c.iconBorder}`,
          color: c.stroke,
        }}
      >
        <span
          className="absolute -top-[5px] -right-[5px] w-[18px] h-[18px] rounded-full flex items-center justify-center z-[2]"
          style={{
            background: '#0A0A0F',
            border: '1.5px solid rgba(255,255,255,0.08)',
            fontFamily: 'monospace',
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          {number}
        </span>
        {icon}
      </div>
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight mb-0.5">{title}</h3>
        <p className="text-[12.5px] leading-relaxed m-0" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {description}
        </p>
      </div>
    </div>
  )
}

function RequirementChip({
  icon,
  label,
  sublabel,
  color,
}: {
  icon: ReactNode
  label: string
  sublabel: string
  color: ThemeColor
}) {
  const c = colorConfig[color]
  return (
    <div
      className="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-[14px] text-center"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="w-8 h-8 rounded-[10px] flex items-center justify-center"
        style={{ background: c.chipBg, color: c.stroke }}
      >
        {icon}
      </div>
      <span className="text-[11px] font-semibold leading-tight" style={{ color: '#f0f0f5' }}>
        {label}
      </span>
      <span
        className="text-[10px] uppercase tracking-wider"
        style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}
      >
        {sublabel}
      </span>
    </div>
  )
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function FeedbackIntakeScreen({
  senderName,
  documentName,
  onStart,
}: FeedbackIntakeScreenProps) {
  const [pressed, setPressed] = useState(false)

  return (
    <div
      className="relative min-h-dvh font-sans antialiased overflow-x-hidden flex flex-col"
      style={{ background: '#0A0A0F', color: '#f0f0f5' }}
    >
      {/* Ambient background blobs */}
      <div className="intake-ambient-pink" />
      <div className="intake-ambient-green" />

      <div className="relative z-[1] flex-1 flex flex-col max-w-[440px] w-full mx-auto px-5">
        {/* Hero */}
        <div style={{ paddingTop: 'clamp(32px, 8vh, 56px)', paddingBottom: 28 }} className="text-center">
          {/* Badge */}
          <div
            className="intake-fade-up inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] tracking-wider uppercase mb-5"
            style={{
              background: 'rgba(255,20,147,0.12)',
              border: '1px solid rgba(255,20,147,0.20)',
              fontFamily: 'monospace',
              color: '#FF6EB4',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-goblin-pink animate-pulse-dot" />
            Feedback Request
          </div>

          <h1
            className="intake-fade-up font-bold leading-[1.15] tracking-tight mb-2.5"
            style={{ fontSize: 'clamp(26px, 7vw, 34px)', animationDelay: '0.1s' }}
          >
            <span className="bg-clip-text text-transparent bg-gradient-to-br from-goblin-pink to-goblin-pink-light">
              {senderName}
            </span>{' '}
            is requesting
            <br />
            feedback!
          </h1>

          <p
            className="intake-fade-up text-[15px] mb-4 leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.5)', animationDelay: '0.15s' }}
          >
            Say any feedback or reactions that come to mind
          </p>

          {documentName && (
            <div
              className="intake-fade-up inline-flex items-center gap-1.5 text-[13px] px-3.5 py-1.5 rounded-lg"
              style={{
                fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.5)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                animationDelay: '0.2s',
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              {documentName}
            </div>
          )}
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-0.5 mb-6">
          <StepItem
            number={1}
            icon={<User className="h-[22px] w-[22px]" />}
            color="pink"
            title="Enter your name"
            description={`Only shown to ${senderName}!`}
            delay={0.3}
          />
          <StepItem
            number={2}
            icon={<PlayCircle className="h-[22px] w-[22px]" />}
            color="indigo"
            title="Quick tutorial"
            description="30-second walkthrough, optional"
            delay={0.4}
          />
          <StepItem
            number={3}
            icon={<Mic className="h-[22px] w-[22px]" />}
            color="green"
            title="Record live feedback"
            description="Talk as you read — we capture it all"
            delay={0.5}
          />
        </div>

        {/* Requirement chips */}
        <div
          className="intake-fade-up flex gap-2 mb-6"
          style={{ animationDelay: '0.4s' }}
        >
          <RequirementChip
            icon={<Mic className="h-[18px] w-[18px]" />}
            label="Audio"
            sublabel="Required"
            color="green"
          />
          <RequirementChip
            icon={<Video className="h-[18px] w-[18px]" />}
            label="Webcam"
            sublabel="Optional"
            color="pink"
          />
          <RequirementChip
            icon={<EyeOff className="h-[18px] w-[18px]" />}
            label="No login"
            sublabel="Anonymous"
            color="indigo"
          />
        </div>

        {/* CTA */}
        <div
          className="intake-fade-up mt-auto"
          style={{ paddingBottom: 'clamp(12px, 3vh, 24px)', animationDelay: '0.5s' }}
        >
          <button
            onClick={onStart}
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            className="relative flex items-center justify-center gap-2.5 w-full py-[18px] px-6 border-none rounded-2xl text-white font-sans text-[17px] font-bold tracking-tight cursor-pointer overflow-hidden transition-[transform,box-shadow] duration-150"
            style={{
              background: 'linear-gradient(135deg, #1DB954, #17a34a)',
              boxShadow: '0 4px 24px rgba(29,185,84,0.25)',
              transform: pressed ? 'translateY(1px) scale(0.98)' : 'translateY(0)',
            }}
          >
            <span className="intake-shimmer" />
            <ArrowRight className="h-5 w-5" />
            Start Recording
          </button>
          <div className="text-center mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <Volume2
              className="h-3.5 w-3.5 inline-block mr-1"
              style={{ verticalAlign: '-2px' }}
            />
            Find a quiet spot — you'll be speaking aloud
          </div>
        </div>

        {/* Quote */}
        <div
          className="intake-fade-up text-center px-6 pt-4 pb-6 font-serif italic text-[13.5px] tracking-wide leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.3)', animationDelay: '0.7s' }}
        >
          <span
            className="inline-block text-goblin-pink opacity-40 not-italic mx-1 text-[10px]"
            style={{ verticalAlign: '1px' }}
          >
            ✦
          </span>
          Transparent feedback is one of the biggest forms of love you can give
          <span
            className="inline-block text-goblin-pink opacity-40 not-italic mx-1 text-[10px]"
            style={{ verticalAlign: '1px' }}
          >
            ✦
          </span>
        </div>
      </div>
    </div>
  )
}
