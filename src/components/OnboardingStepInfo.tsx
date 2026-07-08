import type { ReactNode } from 'react'

interface OnboardingStepInfoProps {
  /** an animated mini-demo of the feature this step teaches */
  demo: ReactNode
  title: string
  description: string
}

export function OnboardingStepInfo({ demo, title, description }: OnboardingStepInfoProps) {
  return (
    <div className="flex flex-col items-center gap-5">
      {demo}
      <div className="text-center">
        <h2 className="text-xl font-bold text-text-primary">{title}</h2>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">
          {description}
        </p>
      </div>
    </div>
  )
}
