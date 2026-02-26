interface OnboardingStepInfoProps {
  svgSrc: string
  title: string
  description: string
}

export function OnboardingStepInfo({ svgSrc, title, description }: OnboardingStepInfoProps) {
  return (
    <div className="flex flex-col items-center gap-5">
      <img
        src={svgSrc}
        alt=""
        className="w-full max-h-48 object-contain"
        draggable={false}
      />
      <div className="text-center">
        <h2 className="text-xl font-bold text-text-primary">{title}</h2>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">
          {description}
        </p>
      </div>
    </div>
  )
}
