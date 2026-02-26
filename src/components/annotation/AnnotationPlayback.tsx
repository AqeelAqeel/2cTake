import { useEffect, useRef, useMemo } from 'react'
import { Canvas as FabricCanvas, FabricImage } from 'fabric'
import type { AnnotationSnapshot } from '../../types/annotation'

interface AnnotationPlaybackProps {
  artifactUrl: string
  artifactType: 'pdf' | 'image' | 'document'
  snapshots: AnnotationSnapshot[]
  currentTime: number
  className?: string
}

export function AnnotationPlayback({
  artifactUrl,
  artifactType,
  snapshots,
  currentTime,
  className = '',
}: AnnotationPlaybackProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<FabricCanvas | null>(null)
  const initialized = useRef(false)
  const bgLoaded = useRef(false)

  // Find the most recent snapshot at or before currentTime
  const activeSnapshot = useMemo(() => {
    if (snapshots.length === 0) return null
    let best: AnnotationSnapshot | null = null
    for (const snap of snapshots) {
      if (snap.timestamp <= currentTime) {
        best = snap
      } else {
        break
      }
    }
    return best
  }, [snapshots, currentTime])

  // Initialize canvas
  useEffect(() => {
    if (initialized.current || !canvasElRef.current || !containerRef.current) return
    if (artifactType === 'document') return
    initialized.current = true

    const container = containerRef.current
    const canvas = new FabricCanvas(canvasElRef.current, {
      selection: false,
      interactive: false,
      preserveObjectStacking: true,
    })

    canvas.setDimensions({
      width: container.clientWidth,
      height: container.clientHeight,
    })

    canvasRef.current = canvas

    return () => {
      canvas.dispose()
      initialized.current = false
      canvasRef.current = null
      bgLoaded.current = false
    }
  }, [artifactType])

  // Load background image
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !artifactUrl || bgLoaded.current) return
    if (artifactType === 'document') return

    let cancelled = false

    const load = async () => {
      try {
        let imageUrl = artifactUrl

        if (artifactType === 'pdf') {
          const { renderAllPdfPages } = await import('../../lib/pdfRenderer')
          const result = await renderAllPdfPages(artifactUrl)
          imageUrl = result.dataUrl
        }

        if (cancelled) return

        const img = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' })
        if (cancelled) return

        const imgWidth = img.width
        const imgHeight = img.height

        const container = containerRef.current
        if (!container) return
        const containerW = container.clientWidth
        const containerH = container.clientHeight
        const aspectRatio = imgHeight / imgWidth
        const fit = aspectRatio > 1.8
          ? containerW / imgWidth
          : Math.min(containerW / imgWidth, containerH / imgHeight)

        img.scaleToWidth(imgWidth)
        img.scaleToHeight(imgHeight)

        canvas.backgroundImage = img
        canvas.setDimensions({ width: imgWidth, height: imgHeight })

        canvas.setZoom(fit)
        const vpw = imgWidth * fit
        const vph = imgHeight * fit
        const offsetX = (containerW - vpw) / 2
        const offsetY = (containerH - vph) / 2
        const vpt = canvas.viewportTransform!
        vpt[4] = offsetX
        vpt[5] = offsetY
        canvas.setViewportTransform(vpt)

        canvas.renderAll()
        bgLoaded.current = true
      } catch (err) {
        console.error('Failed to load playback background:', err)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [artifactUrl, artifactType])

  // Render annotation snapshot when currentTime changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bgLoaded.current) return

    if (!activeSnapshot) {
      // No annotations yet at this time — clear objects
      canvas.getObjects().forEach((obj) => canvas.remove(obj))
      canvas.renderAll()
      return
    }

    // Load the snapshot's objects onto the canvas
    const snapshotData = JSON.parse(activeSnapshot.canvasJSON)

    // Clear current objects
    canvas.getObjects().forEach((obj) => canvas.remove(obj))

    // Load objects from snapshot (preserving background)
    if (snapshotData.objects && snapshotData.objects.length > 0) {
      canvas.loadFromJSON(
        { ...snapshotData, backgroundImage: undefined, background: undefined },
        () => {
          // Make all objects non-interactive
          canvas.forEachObject((obj) => {
            obj.selectable = false
            obj.evented = false
          })
          canvas.renderAll()
        }
      )
    } else {
      canvas.renderAll()
    }
  }, [activeSnapshot])

  // Handle container resize
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const observer = new ResizeObserver(() => {
      canvas.setDimensions(
        { width: container.clientWidth, height: container.clientHeight },
        { cssOnly: true }
      )
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  if (artifactType === 'document' || snapshots.length === 0) return null

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
    >
      <canvas ref={canvasElRef} />
    </div>
  )
}
