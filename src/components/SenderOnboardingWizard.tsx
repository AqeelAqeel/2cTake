import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X, Upload, FileText, Copy, Link2 } from 'lucide-react'
import { useSwipe } from '../lib/useSwipe'

const STEPS = [
  {
    title: 'Upload your artifact',
    description:
      'Drop in a PDF, image, screenshot, or paste a Google Docs link. This is what your reviewers will see.',
  },
  {
    title: 'Add title & context',
    description:
      'Give it a name and tell reviewers what to focus on. Set an optional recording time limit.',
  },
  {
    title: 'Share & collect feedback',
    description:
      'Copy your unique link and send it to anyone. They record video feedback right in their browser — no login needed.',
  },
]

const AUTO_ADVANCE_MS = 5000

interface Props {
  onClose: () => void
}

export function SenderOnboardingWizard({ onClose }: Props) {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [progressKey, setProgressKey] = useState(0)

  const goNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1)
      setProgressKey((k) => k + 1)
    }
  }, [currentStep])

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1)
      setProgressKey((k) => k + 1)
    }
  }, [currentStep])

  const swipeHandlers = useSwipe({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
  })

  // Auto-advance (pause on last step)
  useEffect(() => {
    if (currentStep >= STEPS.length - 1) return
    const timer = setTimeout(goNext, AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [currentStep, progressKey, goNext])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleLetsGo = () => {
    onClose()
    navigate('/new')
  }

  const isLastStep = currentStep === STEPS.length - 1

  return (
    <div
      {...swipeHandlers}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-brand-50 overflow-hidden">
          <div
            key={progressKey}
            className="h-full bg-brand-500 animate-sender-ob-progress"
            style={
              isLastStep
                ? { width: '100%', animation: 'none' }
                : { animationDuration: `${AUTO_ADVANCE_MS}ms` }
            }
          />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-text-muted hover:text-text-secondary transition-colors z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step label */}
        <p className="text-xs font-medium text-text-muted mb-4">
          Step {currentStep + 1} of {STEPS.length}
        </p>

        {/* Step content */}
        <div className="min-h-[320px] flex flex-col justify-center">
          <div key={currentStep} className="flex flex-col items-center gap-5 animate-sender-ob-step-in">
            {/* Illustration */}
            <div className="w-full flex items-center justify-center" style={{ minHeight: 160 }}>
              {currentStep === 0 && <UploadIllustration />}
              {currentStep === 1 && <DetailsIllustration />}
              {currentStep === 2 && <ShareIllustration />}
            </div>

            {/* Text */}
            <div className="text-center">
              <h2
                className="text-xl font-bold text-text-primary"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {STEPS[currentStep].title}
              </h2>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">
                {STEPS[currentStep].description}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={currentStep === 0}
            className="rounded-lg p-2 text-text-muted hover:text-text-primary disabled:opacity-0 transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Dot indicators */}
          <div className="flex gap-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setCurrentStep(i)
                  setProgressKey((k) => k + 1)
                }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-brand-600'
                    : 'w-2 bg-border hover:bg-text-muted'
                }`}
              />
            ))}
          </div>

          {isLastStep ? (
            <button
              onClick={handleLetsGo}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Let's go
            </button>
          ) : (
            <button
              onClick={goNext}
              className="rounded-lg p-2 text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Illustrations — CSS mockups of actual UI
   ═══════════════════════════════════════════════ */

function UploadIllustration() {
  return (
    <div className="relative w-full max-w-[260px]">
      {/* Upload zone mockup */}
      <div className="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/30 px-6 py-8 flex flex-col items-center gap-3 animate-sender-ob-glow">
        <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center">
          <Upload className="w-6 h-6 text-brand-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">
            Drop a file here
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">
            PDF, image, or document
          </p>
        </div>
      </div>

      {/* Floating file icon */}
      <div className="absolute -top-2 -right-2 w-9 h-9 rounded-lg bg-white shadow-lg flex items-center justify-center animate-float border border-brand-100">
        <FileText className="w-4 h-4 text-brand-500" />
      </div>
    </div>
  )
}

function DetailsIllustration() {
  return (
    <div className="w-full max-w-[260px] flex flex-col gap-2.5">
      {/* Title field mockup */}
      <div className="rounded-lg border border-border bg-surface-tertiary px-3 py-2.5">
        <p className="text-[10px] font-medium text-text-muted mb-1">Session title</p>
        <div className="flex items-center">
          <span className="text-sm text-text-primary">Homepage redesign</span>
          <span className="ml-0.5 inline-block w-[2px] h-4 bg-brand-600 animate-sender-ob-cursor" />
        </div>
      </div>

      {/* Context field mockup */}
      <div className="rounded-lg border border-border bg-surface-tertiary px-3 py-2.5">
        <p className="text-[10px] font-medium text-text-muted mb-1">Instructions</p>
        <p className="text-xs text-text-muted">
          What should reviewers focus on?
        </p>
      </div>

      {/* Time limit chips */}
      <div className="flex gap-1.5 mt-0.5">
        {['No limit', '1m', '2m', '3m', '5m'].map((label, i) => (
          <span
            key={label}
            className={`rounded-md px-2 py-1 text-[10px] font-medium ${
              i === 0
                ? 'bg-brand-600 text-white'
                : 'bg-surface-tertiary text-text-muted border border-border'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function ShareIllustration() {
  return (
    <div className="w-full max-w-[260px] flex flex-col items-center gap-3">
      {/* Success icon */}
      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
        <Link2 className="w-5 h-5 text-emerald-600" />
      </div>

      {/* Share link mockup */}
      <div className="relative w-full rounded-lg border border-border bg-surface-tertiary px-3 py-2.5 flex items-center gap-2 overflow-hidden">
        <span className="flex-1 text-xs text-text-secondary truncate font-mono">
          2ctake.com/review/a8f3k…
        </span>
        <span className="shrink-0 flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[10px] font-semibold text-white">
          <Copy className="w-3 h-3" />
          Copy
        </span>
        {/* Shimmer overlay */}
        <span className="intake-shimmer rounded-lg" />
      </div>

      {/* Hint text */}
      <p className="text-[11px] text-text-muted text-center">
        Anyone with the link can record feedback — no login required
      </p>
    </div>
  )
}
