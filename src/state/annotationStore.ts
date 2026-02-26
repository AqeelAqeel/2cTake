import { create } from 'zustand'
import type { ToolType, BrushSize, AnnotationSnapshot } from '../types/annotation'
import { DEFAULT_ANNOTATION_COLOR } from '../types/annotation'

interface AnnotationState {
  activeTool: ToolType
  brushSize: BrushSize
  color: string
  annotationEnabled: boolean
  zoomLevel: number
  snapshots: AnnotationSnapshot[]
  recordingStartTime: number | null

  setActiveTool: (tool: ToolType) => void
  setBrushSize: (size: BrushSize) => void
  setColor: (color: string) => void
  setAnnotationEnabled: (enabled: boolean) => void
  setZoomLevel: (zoom: number) => void
  setRecordingStartTime: (time: number) => void
  captureSnapshot: (canvasJSON: string) => void
  reset: () => void
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  activeTool: 'pen',
  brushSize: 'medium',
  color: DEFAULT_ANNOTATION_COLOR,
  annotationEnabled: true,
  zoomLevel: 1,
  snapshots: [],
  recordingStartTime: null,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setBrushSize: (size) => set({ brushSize: size }),
  setColor: (color) => set({ color }),
  setAnnotationEnabled: (enabled) => set({ annotationEnabled: enabled }),
  setZoomLevel: (zoom) => set({ zoomLevel: zoom }),
  setRecordingStartTime: (time) => set({ recordingStartTime: time }),

  captureSnapshot: (canvasJSON) => {
    const startTime = get().recordingStartTime
    if (!startTime) return
    const timestamp = (Date.now() - startTime) / 1000
    set((state) => ({
      snapshots: [...state.snapshots, { timestamp, canvasJSON }],
    }))
  },

  reset: () =>
    set({
      activeTool: 'pen',
      brushSize: 'medium',
      color: DEFAULT_ANNOTATION_COLOR,
      annotationEnabled: true,
      zoomLevel: 1,
      snapshots: [],
      recordingStartTime: null,
    }),
}))
