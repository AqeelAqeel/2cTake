import { useEffect, useRef, useCallback } from 'react'
import { Canvas, PencilBrush, Circle, Rect } from 'fabric'
import type { ToolType, BrushSize } from '../../types/annotation'
import { BRUSH_WIDTHS } from '../../types/annotation'

// Fabric v6 canvas event option shape
interface FabricPointerEvent {
  e: MouseEvent | TouchEvent | PointerEvent
  scenePoint?: { x: number; y: number }
  viewportPoint?: { x: number; y: number }
}

type EraserMode = 'tap' | 'stroke'

interface UseAnnotationToolsConfig {
  canvas: Canvas | null
  activeTool: ToolType
  brushSize: BrushSize
  color: string
  eraserMode: EraserMode
  annotationEnabled: boolean
  onSnapshotCapture: () => void
}

export function useAnnotationTools({
  canvas,
  activeTool,
  brushSize,
  color,
  eraserMode,
  annotationEnabled,
  onSnapshotCapture,
}: UseAnnotationToolsConfig) {
  const isDrawingShape = useRef(false)
  const activeShape = useRef<Circle | Rect | null>(null)
  const originRef = useRef({ x: 0, y: 0 })

  // Configure canvas based on active tool
  useEffect(() => {
    if (!canvas) return

    if (!annotationEnabled) {
      canvas.isDrawingMode = false
      canvas.selection = false
      canvas.defaultCursor = 'grab'
      canvas.hoverCursor = 'grab'
      canvas.forEachObject((obj) => {
        obj.selectable = false
        obj.evented = false
      })
      return
    }

    // Re-enable objects for interaction
    canvas.forEachObject((obj) => {
      obj.selectable = activeTool === 'select'
      obj.evented = activeTool === 'select' || (activeTool === 'eraser' && eraserMode === 'tap')
    })

    switch (activeTool) {
      case 'pen': {
        canvas.isDrawingMode = true
        canvas.selection = false
        const brush = new PencilBrush(canvas)
        brush.color = color
        brush.width = BRUSH_WIDTHS[brushSize] / canvas.getZoom()
        canvas.freeDrawingBrush = brush
        canvas.defaultCursor = 'crosshair'
        break
      }
      case 'eraser': {
        if (eraserMode === 'stroke') {
          // Freehand eraser: draws with a semi-transparent white stroke
          canvas.isDrawingMode = true
          canvas.selection = false
          const brush = new PencilBrush(canvas)
          brush.color = 'rgba(255,255,255,0.95)'
          brush.width = (BRUSH_WIDTHS[brushSize] * 3) / canvas.getZoom()
          canvas.freeDrawingBrush = brush
          canvas.defaultCursor = 'crosshair'
        } else {
          // Tap-to-delete
          canvas.isDrawingMode = false
          canvas.selection = false
          canvas.defaultCursor = 'pointer'
          canvas.hoverCursor = 'pointer'
        }
        break
      }
      case 'circle':
      case 'rectangle': {
        canvas.isDrawingMode = false
        canvas.selection = false
        canvas.defaultCursor = 'crosshair'
        canvas.hoverCursor = 'crosshair'
        break
      }
      case 'select': {
        canvas.isDrawingMode = false
        canvas.selection = true
        canvas.defaultCursor = 'default'
        canvas.hoverCursor = 'move'
        break
      }
      default: {
        canvas.isDrawingMode = false
        canvas.selection = false
        canvas.defaultCursor = 'default'
        break
      }
    }

    canvas.renderAll()
  }, [canvas, activeTool, brushSize, color, eraserMode, annotationEnabled])

  // Update brush width when zoom changes
  const updateBrushForZoom = useCallback(() => {
    if (!canvas || !canvas.freeDrawingBrush) return
    if (activeTool === 'pen') {
      canvas.freeDrawingBrush.width = BRUSH_WIDTHS[brushSize] / canvas.getZoom()
    } else if (activeTool === 'eraser' && eraserMode === 'stroke') {
      canvas.freeDrawingBrush.width = (BRUSH_WIDTHS[brushSize] * 3) / canvas.getZoom()
    }
  }, [canvas, activeTool, brushSize, eraserMode])

  // Eraser: tap-to-delete mode
  useEffect(() => {
    if (!canvas || activeTool !== 'eraser' || eraserMode !== 'tap' || !annotationEnabled) return

    const handleMouseDown = (opt: FabricPointerEvent) => {
      const target = canvas.findTarget(opt.e as never)
      if (target) {
        canvas.remove(target)
        canvas.renderAll()
        onSnapshotCapture()
      }
    }

    canvas.on('mouse:down', handleMouseDown as never)
    return () => {
      canvas.off('mouse:down', handleMouseDown as never)
    }
  }, [canvas, activeTool, eraserMode, annotationEnabled, onSnapshotCapture])

  // Shape drawing: circle and rectangle
  useEffect(() => {
    if (!canvas || (activeTool !== 'circle' && activeTool !== 'rectangle') || !annotationEnabled) return

    const handleMouseDown = (opt: FabricPointerEvent) => {
      if (isDrawingShape.current) return
      isDrawingShape.current = true
      const pointer = canvas.getScenePoint(opt.e as never)
      originRef.current = { x: pointer.x, y: pointer.y }

      const strokeWidth = BRUSH_WIDTHS[brushSize] / canvas.getZoom()

      if (activeTool === 'circle') {
        const circle = new Circle({
          left: pointer.x,
          top: pointer.y,
          radius: 0,
          fill: 'transparent',
          stroke: color,
          strokeWidth,
          originX: 'center',
          originY: 'center',
        })
        activeShape.current = circle
        canvas.add(circle)
      } else {
        const rect = new Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: 'transparent',
          stroke: color,
          strokeWidth,
        })
        activeShape.current = rect
        canvas.add(rect)
      }
    }

    const handleMouseMove = (opt: FabricPointerEvent) => {
      if (!isDrawingShape.current || !activeShape.current) return
      const pointer = canvas.getScenePoint(opt.e as never)

      if (activeTool === 'circle' && activeShape.current instanceof Circle) {
        const dx = pointer.x - originRef.current.x
        const dy = pointer.y - originRef.current.y
        const radius = Math.sqrt(dx * dx + dy * dy)
        activeShape.current.set({ radius })
      } else if (activeTool === 'rectangle' && activeShape.current instanceof Rect) {
        const left = Math.min(originRef.current.x, pointer.x)
        const top = Math.min(originRef.current.y, pointer.y)
        const width = Math.abs(pointer.x - originRef.current.x)
        const height = Math.abs(pointer.y - originRef.current.y)
        activeShape.current.set({ left, top, width, height })
      }

      canvas.renderAll()
    }

    const handleMouseUp = () => {
      if (!isDrawingShape.current) return
      isDrawingShape.current = false

      if (activeShape.current) {
        activeShape.current.setCoords()
        canvas.setActiveObject(activeShape.current)
        activeShape.current = null
        canvas.renderAll()
        onSnapshotCapture()
      }
    }

    canvas.on('mouse:down', handleMouseDown as never)
    canvas.on('mouse:move', handleMouseMove as never)
    canvas.on('mouse:up', handleMouseUp as never)

    return () => {
      canvas.off('mouse:down', handleMouseDown as never)
      canvas.off('mouse:move', handleMouseMove as never)
      canvas.off('mouse:up', handleMouseUp as never)
    }
  }, [canvas, activeTool, brushSize, color, annotationEnabled, onSnapshotCapture])

  // Capture snapshot on pen/eraser-stroke completion
  useEffect(() => {
    if (!canvas || !annotationEnabled) return
    if (activeTool !== 'pen' && !(activeTool === 'eraser' && eraserMode === 'stroke')) return

    const handlePathCreated = () => {
      onSnapshotCapture()
    }

    canvas.on('path:created', handlePathCreated as never)
    return () => {
      canvas.off('path:created', handlePathCreated as never)
    }
  }, [canvas, activeTool, eraserMode, annotationEnabled, onSnapshotCapture])

  // Capture snapshot on object modified (move/resize)
  useEffect(() => {
    if (!canvas || !annotationEnabled) return

    const handleModified = () => {
      onSnapshotCapture()
    }

    canvas.on('object:modified', handleModified as never)
    return () => {
      canvas.off('object:modified', handleModified as never)
    }
  }, [canvas, annotationEnabled, onSnapshotCapture])

  return { updateBrushForZoom }
}
