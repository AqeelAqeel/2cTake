import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, Send, Loader2, MessageCircle } from 'lucide-react'
import { askCoach, type AssistantTurn, type CoachStats } from '../lib/api'

// AI coach that aggregates collected feedback and helps the user synthesize it.
export function CoachChat({ projectId }: { projectId?: string }) {
  const [messages, setMessages] = useState<AssistantTurn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<CoachStats | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const run = useCallback(
    async (history: AssistantTurn[]) => {
      setBusy(true)
      setError(null)
      try {
        const { reply, stats } = await askCoach(history, projectId)
        setStats(stats)
        setMessages((m) => [...m, { role: 'assistant', content: reply || '…' }])
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [projectId]
  )

  // Auto-generate an opening synthesis when mounted / project changes.
  useEffect(() => {
    setMessages([])
    setStats(null)
    run([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const next: AssistantTurn[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setInput('')
    run(next)
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-goblin-green to-brand-600">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary leading-none">Feedback Coach</p>
            <p className="mt-0.5 text-xs text-text-muted">Aggregates what people said</p>
          </div>
        </div>
        {stats && (
          <span className="rounded-full bg-surface-tertiary px-2.5 py-1 text-xs text-text-muted">
            {stats.messages} msg{stats.messages === 1 ? '' : 's'} · {stats.contacts} people
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 min-h-[300px] max-h-[520px]">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-sm text-white'
                  : 'max-w-[90%] rounded-2xl rounded-bl-sm bg-surface-tertiary px-3.5 py-2 text-sm text-text-primary whitespace-pre-wrap'
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-surface-tertiary px-3.5 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
            </div>
          </div>
        )}
      </div>

      {error && <p className="px-4 pb-1 text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 px-4 pb-2">
        {['What are the main themes?', 'Where do people disagree?', 'What should I do next?'].map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={busy}
            className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary hover:bg-surface-tertiary disabled:opacity-40"
          >
            <Sparkles className="h-3 w-3" />
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the coach about your feedback…"
          className="flex-1 rounded-xl border border-border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
