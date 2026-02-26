export type ToolType = 'pen' | 'eraser' | 'circle' | 'rectangle' | 'select' | 'none'

export type BrushSize = 'small' | 'medium' | 'large'

export const BRUSH_WIDTHS: Record<BrushSize, number> = {
  small: 2,
  medium: 5,
  large: 10,
}

export interface AnnotationSnapshot {
  timestamp: number // seconds since recording start
  canvasJSON: string // fabric canvas serialized JSON
}

export const ANNOTATION_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ffffff', // white
  '#000000', // black
]

export const DEFAULT_ANNOTATION_COLOR = '#ef4444'
