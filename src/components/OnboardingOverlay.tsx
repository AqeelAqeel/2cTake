import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSwipe } from '../lib/useSwipe'
import { OnboardingStepInfo } from './OnboardingStepInfo'
import { OnboardingStepMicTest } from './OnboardingStepMicTest'

const STEPS = [
  {
    svg: '/reviewer/step-1.svg',
    title: 'You can mark things up!',
    description:
      "The document will stay sticky with your markups, zoom, and speaker — and they'll all be timestamped!",
  },
  {
    svg: '/reviewer/step-2.svg',
    title: "You're being recorded!",
    description:
      'Your audio will be highly accurately transcribed. Speak as fast or as much as you want with none (preferred) to moderate background ambient audio.',
  },
]

interface OnboardingOverlayProps {
  onComplete: (stream: MediaStream) => void
}

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const totalSteps = 3

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
    setCurrentStep(2) // Jump to mandatory mic test
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

  return (
    <div
      {...swipeHandlers}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Content card */}
      <div className="relative w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        {/* Skip button (steps 0 and 1 only) */}
        {currentStep < 2 && (
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
        <div className="min-h-[320px] flex flex-col justify-center">
          {currentStep < 2 ? (
            <OnboardingStepInfo
              svgSrc={STEPS[currentStep].svg}
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

          {currentStep < 2 ? (
            <button
              onClick={goNext}
              className="rounded-lg p-2 text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : (
            // Placeholder to keep layout balanced on step 3
            <div className="w-9" />
          )}
        </div>
      </div>
    </div>
  )
}
