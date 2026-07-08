import { useState, useEffect, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSwipe } from '../lib/useSwipe'
import { OnboardingStepInfo } from './OnboardingStepInfo'
import { OnboardingStepMicTest } from './OnboardingStepMicTest'
import { MarkupDemo } from './onboarding/MarkupDemo'
import { CommentDemo } from './onboarding/CommentDemo'
import { RecordingDemo } from './onboarding/RecordingDemo'
import { ControlsDemo } from './onboarding/ControlsDemo'

interface InfoStep {
  demo: ReactNode
  title: string
  description: string
}

const STEPS: InfoStep[] = [
  {
    demo: <MarkupDemo />,
    title: 'Mark it up as you talk',
    description:
      "Highlight, draw, or circle anything on the document. Your markups stay sticky with the page, zoom, and speaker — and they're all timestamped to your recording.",
  },
  {
    demo: <CommentDemo />,
    title: 'Pin a sticky comment anywhere',
    description:
      'Tap a spot to drop a pinned note. Type it or hit the mic to dictate — each comment sticks to that exact place and moment in your take.',
  },
  {
    demo: <RecordingDemo />,
    title: "You're being recorded",
    description:
      'Your webcam and audio capture your reaction while you speak. Everything is transcribed highly accurately — talk as fast or as much as you like, ideally with quiet surroundings.',
  },
  {
    demo: <ControlsDemo />,
    title: 'Pause, preview, re-record',
    description:
      'Need a beat? Pause anytime. When you finish you can preview the whole take and re-record before you send it — nothing goes out until you hit send.',
  },
]

interface OnboardingOverlayProps {
  onComplete: (stream: MediaStream) => void
}

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const micTestStep = STEPS.length // mic test is the final, mandatory step
  const totalSteps = STEPS.length + 1

  const goNext = () => {
    if (currentStep < totalSteps - 1) setCurrentStep((s) => s + 1)
  }

  const goPrev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1)
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
  })

  const handleSkip = () => {
    setCurrentStep(micTestStep) // jump straight to the mandatory mic test
  }

  const handleMicTestPass = (stream: MediaStream) => {
    onComplete(stream)
  }

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const onInfoStep = currentStep < micTestStep

  return (
    <div
      {...swipeHandlers}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Content card */}
      <div className="relative w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        {/* Skip button (info steps only) */}
        {onInfoStep && (
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 text-sm font-medium text-text-muted hover:text-text-secondary transition-colors z-10"
          >
            Skip
          </button>
        )}

        {/* Step indicator label */}
        <p className="text-xs font-medium text-text-muted mb-4">
          Step {currentStep + 1} of {totalSteps}
        </p>

        {/* Step content */}
        <div className="min-h-[340px] flex flex-col justify-center">
          {onInfoStep ? (
            <OnboardingStepInfo
              demo={STEPS[currentStep].demo}
              title={STEPS[currentStep].title}
              description={STEPS[currentStep].description}
            />
          ) : (
            <OnboardingStepMicTest onPass={handleMicTestPass} />
          )}
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
            {Array.from({ length: totalSteps }, (_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-brand-600'
                    : 'w-2 bg-border hover:bg-text-muted'
                }`}
              />
            ))}
          </div>

          {onInfoStep ? (
            <button
              onClick={goNext}
              className="rounded-lg p-2 text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : (
            // Placeholder to keep layout balanced on the mic-test step
            <div className="w-9" />
          )}
        </div>
      </div>
    </div>
  )
}
