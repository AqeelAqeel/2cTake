import { useEffect, useRef, useState, useCallback } from 'react'
import type { Canvas as FabricCanvas } from 'fabric'
import { MessageSquare, Mic, Trash2 } from 'lucide-react'
import { useCommentStore } from '../../state/commentStore'
import { useRecorderStore } from '../../state/recorderStore'
import type { CommentAnchor } from '../../types/comment'
import { CommentComposer } from './CommentComposer'

interface CommentLayerProps {
  canvas: FabricCanvas | null
  bgWidth: number
  bgHeight: number
}

const DRAG_THRESHOLD = 8 // px — below this a drag is treated as a tap (pin)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Overlay that turns the artifact into a commentable surface. It mirrors the
 * Fabric canvas's viewport transform so comment pins/highlights stay glued to
 * the artifact through zoom, pan, and resize.
 *
 * - Comment mode ON: a full-surface capture layer turns taps into pins and
 *   drags into highlight regions, then opens the composer.
 * - Comment mode OFF: the capture layer is gone (drawing/gestures pass through),
 *   but existing pins remain clickable so the reviewer can re-read or delete.
 */
export function CommentLayer({ canvas, bgWidth, bgHeight }: CommentLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const recordingStream = useRecorderStore((s) => s.mediaStream)
  const { comments, commentMode, draft, openDraft, cancelDraft, addComment, removeComment } =
    useCommentStore()

  // Track the layer's own size (for keeping the composer popover on-screen) via
  // a ResizeObserver, so we never read a ref during render. Depend on bgWidth
  // too: the measured div only mounts once the background has loaded (see the
  // `bgWidth === 0` early-return below), and `canvas` alone doesn't change at
  // that point — without bgWidth in the deps the effect would run while the ref
  // is still null and the size would stay 0.
  const [layerSize, setLayerSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => setLayerSize({ w: el.clientWidth, h: el.clientHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [canvas, bgWidth])

  // Bump on every canvas render so pin positions follow pan/zoom. Throttled to
  // one update per animation frame to avoid thrashing React during gestures.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!canvas) return
    let raf = 0
    const onRender = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        forceTick((t) => t + 1)
      })
    }
    canvas.on('after:render', onRender)
    return () => {
      canvas.off('after:render', onRender)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [canvas])

  const zoom = canvas?.getZoom() ?? 1
  const vpt = canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const tx = vpt[4]
  const ty = vpt[5]

  const toScreen = useCallback(
    (nx: number, ny: number) => ({
      x: nx * bgWidth * zoom + tx,
      y: ny * bgHeight * zoom + ty,
    }),
    [bgWidth, bgHeight, zoom, tx, ty]
  )

  const fromScreen = useCallback(
    (px: number, py: number) => ({
      x: bgWidth > 0 ? clamp01((px - tx) / (bgWidth * zoom)) : 0,
      y: bgHeight > 0 ? clamp01((py - ty) / (bgHeight * zoom)) : 0,
    }),
    [bgWidth, bgHeight, zoom, tx, ty]
  )

  // ── Placement gesture (tap = pin, drag = highlight) ───────────────────────
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [openPinId, setOpenPinId] = useState<string | null>(null)

  const localPoint = (e: React.PointerEvent) => {
    const rect = rootRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleCaptureDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragStart.current = localPoint(e)
    setDragRect(null)
    setOpenPinId(null)
    cancelDraft()
  }

  const handleCaptureMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return
    e.stopPropagation()
    const p = localPoint(e)
    const s = dragStart.current
    setDragRect({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    })
  }

  const handleCaptureUp = (e: React.PointerEvent) => {
    if (!dragStart.current) return
    e.stopPropagation()
    const s = dragStart.current
    const p = localPoint(e)
    dragStart.current = null
    setDragRect(null)

    const moved = Math.hypot(p.x - s.x, p.y - s.y)
    let anchor: CommentAnchor
    let screen: { x: number; y: number }

    if (moved < DRAG_THRESHOLD) {
      const n = fromScreen(s.x, s.y)
      anchor = { kind: 'pin', x: n.x, y: n.y }
      screen = s
    } else {
      const tl = fromScreen(Math.min(s.x, p.x), Math.min(s.y, p.y))
      const br = fromScreen(Math.max(s.x, p.x), Math.max(s.y, p.y))
      anchor = { kind: 'highlight', x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }
      screen = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y) }
    }
    openDraft(anchor, screen)
  }

  if (!canvas || bgWidth === 0) return null

  return (
    <div ref={rootRef} className="absolute inset-0 z-20" style={{ pointerEvents: 'none' }}>
      {/* Capture surface (comment mode only) */}
      {commentMode && !draft && (
        <div
          className="absolute inset-0"
          style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
          onPointerDown={handleCaptureDown}
          onPointerMove={handleCaptureMove}
          onPointerUp={handleCaptureUp}
        />
      )}

      {/* Drag preview rectangle */}
      {dragRect && (
        <div
          className="absolute rounded-md border-2 border-goblin-pink bg-goblin-pink/15"
          style={{ left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h }}
        />
      )}

      {/* Committed comment markers */}
      {comments.map((c, i) => {
        const anchor = c.anchor
        const isVoice = !!c.audioBlob
        if (anchor.kind === 'highlight') {
          const tl = toScreen(anchor.x, anchor.y)
          const w = (anchor.w ?? 0) * bgWidth * zoom
          const h = (anchor.h ?? 0) * bgHeight * zoom
          return (
            <div key={c.id}>
              <div
                className="absolute rounded-sm bg-goblin-pink/20 border border-goblin-pink/60"
                style={{ left: tl.x, top: tl.y, width: w, height: h, pointerEvents: 'none' }}
              />
              <CommentMarker
                index={i + 1}
                isVoice={isVoice}
                x={tl.x}
                y={tl.y}
                open={openPinId === c.id}
                text={c.bodyText}
                onToggle={() => setOpenPinId((id) => (id === c.id ? null : c.id))}
                onDelete={() => {
                  removeComment(c.id)
                  setOpenPinId(null)
                }}
              />
            </div>
          )
        }
        const pos = toScreen(anchor.x, anchor.y)
        return (
          <CommentMarker
            key={c.id}
            index={i + 1}
            isVoice={isVoice}
            x={pos.x}
            y={pos.y}
            open={openPinId === c.id}
            text={c.bodyText}
            onToggle={() => setOpenPinId((id) => (id === c.id ? null : c.id))}
            onDelete={() => {
              removeComment(c.id)
              setOpenPinId(null)
            }}
          />
        )
      })}

      {/* Draft marker + composer */}
      {draft && (
        <>
          <div
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-goblin-pink ring-4 ring-goblin-pink/30"
            style={{
              left: toScreen(draft.anchor.x, draft.anchor.y).x,
              top: toScreen(draft.anchor.x, draft.anchor.y).y,
            }}
          />
          <CommentComposer
            screen={draft.screen}
            layerWidth={layerSize.w || 320}
            layerHeight={layerSize.h || 480}
            recordingStream={recordingStream}
            onSave={(input) => addComment(input)}
            onCancel={cancelDraft}
          />
        </>
      )}
    </div>
  )
}

// ── Pin marker + read/delete popover ────────────────────────────────────────

function CommentMarker({
  index,
  isVoice,
  x,
  y,
  open,
  text,
  onToggle,
  onDelete,
}: {
  index: number
  isVoice: boolean
  x: number
  y: number
  open: boolean
  text: string
  onToggle: () => void
  onDelete: () => void
}) {
  const Icon = isVoice ? Mic : MessageSquare
  return (
    <>
      <button
        className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-goblin-pink text-white shadow-md ring-2 ring-white hover:scale-110 transition-transform"
        style={{ left: x, top: y, pointerEvents: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        title={`Comment ${index}`}
      >
        <Icon className="h-3 w-3" />
      </button>
      {open && (
        <div
          className="absolute z-40 w-48 -translate-x-1/2 translate-y-2 rounded-xl border border-border bg-surface/95 backdrop-blur p-2.5 shadow-2xl"
          style={{ left: x, top: y, pointerEvents: 'auto' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-goblin-pink/15 text-[10px] font-bold text-goblin-pink">
              {index}
            </span>
            <p className="flex-1 text-[12px] text-text-primary">
              {text || (isVoice ? '🎙 Voice note' : '—')}
            </p>
            <button
              onClick={onDelete}
              className="rounded-md p-0.5 text-text-muted hover:text-red-500"
              title="Delete comment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {isVoice && text && (
            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-text-muted">
              <Mic className="h-3 w-3" /> voice note attached
            </p>
          )}
        </div>
      )}
    </>
  )
}
