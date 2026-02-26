import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, ChevronDown } from 'lucide-react'

interface ZoomIndicatorProps {
  zoom: number
  onZoomChange: (zoom: number) => void
  fitZoom: number
}

const PRESETS = [
  { label: '50%', value: 0.5 },
  { label: '100%', value: 1 },
  { label: '150%', value: 1.5 },
  { label: '200%', value: 2 },
]

export function ZoomIndicator({ zoom, onZoomChange, fitZoom }: ZoomIndicatorProps) {
  const [visible, setVisible] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastZoom = useRef(zoom)

  const resetFadeTimer = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => {
      if (!dropdownOpen) setVisible(false)
    }, 2000)
  }, [dropdownOpen])

  // Show indicator when zoom changes
  useEffect(() => {
    if (Math.abs(zoom - lastZoom.current) > 0.01) {
      setVisible(true)
      resetFadeTimer()
      lastZoom.current = zoom
    }
  }, [zoom, resetFadeTimer])

  // Keep visible while dropdown is open
  useEffect(() => {
    if (dropdownOpen) {
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
    } else if (visible) {
      resetFadeTimer()
    }
  }, [dropdownOpen, visible, resetFadeTimer])

  useEffect(() => {
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
    }
  }, [])

  const handlePreset = (value: number) => {
    onZoomChange(value)
    setDropdownOpen(false)
    lastZoom.current = value
    resetFadeTimer()
  }

  const handleTap = () => {
    if (!visible) {
      setVisible(true)
      resetFadeTimer()
      return
    }
    setDropdownOpen((o) => !o)
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30">
      <button
        onClick={handleTap}
        className={`flex items-center gap-1.5 rounded-full bg-surface/90 backdrop-blur border border-border px-3 py-1.5 shadow-lg transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <Search className="h-3.5 w-3.5 text-text-secondary" />
        <span className="text-xs font-semibold text-text-primary tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <ChevronDown className="h-3 w-3 text-text-muted" />
      </button>

      {dropdownOpen && visible && (
        <div className="mt-1 rounded-xl bg-surface border border-border shadow-lg p-1 min-w-[100px]">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p.value)}
              className={`w-full text-left rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                Math.abs(zoom - p.value) < 0.01
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-text-primary hover:bg-surface-tertiary'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => handlePreset(fitZoom)}
            className={`w-full text-left rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              Math.abs(zoom - fitZoom) < 0.01
                ? 'bg-brand-50 text-brand-700'
                : 'text-text-primary hover:bg-surface-tertiary'
            }`}
          >
            Fit
          </button>
        </div>
      )}
    </div>
  )
}
