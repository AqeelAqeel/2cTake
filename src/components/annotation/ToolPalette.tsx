import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Pencil,
  Circle,
  Square,
  Eraser,
  MousePointer2,
  ChevronUp,
} from 'lucide-react'
import type { ToolType, BrushSize } from '../../types/annotation'

interface ToolPaletteProps {
  activeTool: ToolType
  brushSize: BrushSize
  visible: boolean
  onSelectTool: (tool: ToolType) => void
  onSelectSize: (size: BrushSize) => void
}

const TOOLS: { id: ToolType; icon: typeof Pencil; label: string }[] = [
  { id: 'pen', icon: Pencil, label: 'Draw' },
  { id: 'circle', icon: Circle, label: 'Circle' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'select', icon: MousePointer2, label: 'Select' },
]

const SIZES: { id: BrushSize; label: string; dotSize: string }[] = [
  { id: 'small', label: 'S', dotSize: 'h-1.5 w-1.5' },
  { id: 'medium', label: 'M', dotSize: 'h-2.5 w-2.5' },
  { id: 'large', label: 'L', dotSize: 'h-4 w-4' },
]

const TOOLS_WITH_SIZES: ToolType[] = ['pen', 'circle', 'rectangle', 'eraser']

export function ToolPalette({
  activeTool,
  brushSize,
  visible,
  onSelectTool,
  onSelectSize,
}: ToolPaletteProps) {
  const [expanded, setExpanded] = useState(true)
  const [showSizes, setShowSizes] = useState(false)
  const [faded, setFaded] = useState(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetFade = useCallback(() => {
    setFaded(false)
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => setFaded(true), 5000)
  }, [])

  useEffect(() => {
    if (visible && expanded) resetFade()
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
    }
  }, [visible, expanded, resetFade])

  const handleToolClick = (toolId: ToolType) => {
    resetFade()
    if (activeTool === toolId && TOOLS_WITH_SIZES.includes(toolId)) {
      setShowSizes((s) => !s)
    } else {
      onSelectTool(toolId)
      setShowSizes(false)
    }
  }

  const handleSizeClick = (size: BrushSize) => {
    resetFade()
    onSelectSize(size)
    setShowSizes(false)
  }

  if (!visible) return null

  const ActiveIcon = TOOLS.find((t) => t.id === activeTool)?.icon ?? Pencil

  return (
    <div
      className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 transition-opacity duration-300 ${
        faded ? 'opacity-30 hover:opacity-100' : 'opacity-100'
      }`}
      onPointerDown={resetFade}
    >
      {/* Size sub-palette */}
      {expanded && showSizes && TOOLS_WITH_SIZES.includes(activeTool) && (
        <div className="flex items-center gap-1 rounded-2xl bg-surface/90 backdrop-blur border border-border px-2 py-1.5 shadow-lg">
          {SIZES.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSizeClick(s.id)}
              className={`flex items-center justify-center rounded-lg p-2 transition-colors ${
                brushSize === s.id
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-text-secondary hover:bg-surface-tertiary'
              }`}
              title={s.label}
            >
              <div className={`rounded-full bg-current ${s.dotSize}`} />
            </button>
          ))}
        </div>
      )}

      {/* Main tool bar */}
      {expanded ? (
        <div className="flex items-center gap-0.5 rounded-2xl bg-surface/90 backdrop-blur border border-border px-1.5 py-1 shadow-lg">
          {TOOLS.map((tool) => {
            const Icon = tool.icon
            const isActive = activeTool === tool.id
            return (
              <button
                key={tool.id}
                onClick={() => handleToolClick(tool.id)}
                className={`rounded-xl p-2.5 transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                }`}
                title={tool.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}

          {/* Collapse button */}
          <div className="w-px h-5 bg-border mx-0.5" />
          <button
            onClick={() => {
              setExpanded(false)
              setShowSizes(false)
            }}
            className="rounded-xl p-2.5 text-text-muted hover:bg-surface-tertiary hover:text-text-primary transition-colors"
            title="Collapse"
          >
            <ChevronUp className="h-3.5 w-3.5 rotate-180" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setExpanded(true)
            resetFade()
          }}
          className="rounded-2xl bg-surface/90 backdrop-blur border border-border p-3 shadow-lg text-text-secondary hover:text-text-primary transition-colors"
          title="Expand tools"
        >
          <ActiveIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
