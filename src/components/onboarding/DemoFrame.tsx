import type { ReactNode } from 'react'

/**
 * Shared mini "reviewer screen" chrome that every onboarding demo animates on
 * top of. Renders a faux document page (title bar + text lines); each demo
 * layers its own interaction on top via `children`.
 */
export function DemoFrame({
  children,
  lines = [10, 8, 9, 6, 8, 5],
  dim = false,
}: {
  children?: ReactNode
  /** relative widths (0–12) of the faux text lines */
  lines?: number[]
  /** dim the page so an overlaid recording / preview reads as the focus */
  dim?: boolean
}) {
  return (
    <div className="rob-demo relative mx-auto h-44 w-full max-w-[320px] overflow-hidden rounded-xl border border-border bg-surface-tertiary">
      {/* faux document page */}
      <div
        className={`absolute inset-3 rounded-lg bg-surface p-3 shadow-sm transition-opacity ${
          dim ? 'opacity-50' : ''
        }`}
      >
        <div className="h-2.5 w-2/5 rounded-full bg-text-primary/25" />
        <div className="mt-3 flex flex-col gap-2">
          {lines.map((w, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full bg-text-muted/25"
              style={{ width: `${(w / 12) * 100}%` }}
            />
          ))}
        </div>
      </div>
      {children}
    </div>
  )
}
