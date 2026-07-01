import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Phone,
  Plus,
  Trash2,
  Check,
  Send,
  Loader2,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Save,
  MessageSquare,
} from 'lucide-react'
import { useContactsStore, normalizePhone } from '../state/contactsStore'
import { useSessionStore } from '../state/sessionStore'
import { useSettingsStore } from '../state/settingsStore'
import { useAuthStore } from '../state/authStore'
import { sendQuoText, type SendTextResult } from '../lib/api'
import { ContactsAssistant } from '../components/ContactsAssistant'

const DEFAULT_BODY = '{{sender}} wants your 2c take. Watch it and record a quick reaction: {{link}}'

function fillPreview(body: string, link: string, sender: string, name: string): string {
  return body
    .replace(/\{\{\s*link\s*\}\}/gi, link || '<review link>')
    .replace(/\{\{\s*name\s*\}\}/gi, name || 'there')
    .replace(/\{\{\s*sender\s*\}\}/gi, sender || 'someone')
}

export function Contacts() {
  const {
    contacts,
    templates,
    counts,
    loading,
    fetchAll,
    addContact,
    toggleConfirmed,
    deleteContact,
    addTemplate,
    deleteTemplate,
    fetchCounts,
  } = useContactsStore()
  const { sessions, fetchSessions } = useSessionStore()
  const { projects, fetchProjects } = useSettingsStore()
  const { user } = useAuthStore()

  const senderName = user?.name?.split(' ')[0] ?? ''

  // compose state
  const [sessionId, setSessionId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [manualLink, setManualLink] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [body, setBody] = useState(DEFAULT_BODY)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendTextResult | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  // add-contact form
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newConfirmed, setNewConfirmed] = useState(true)
  const [contactError, setContactError] = useState<string | null>(null)

  // save-template form
  const [tplName, setTplName] = useState('')

  useEffect(() => {
    fetchAll()
    fetchSessions()
    fetchProjects()
  }, [fetchAll, fetchSessions, fetchProjects])

  const link = useMemo(() => {
    if (manualLink.trim()) return manualLink.trim()
    const s = sessions.find((s) => s.id === sessionId)
    if (!s) return ''
    return `${window.location.origin}/review/${s.share_token}`
  }, [manualLink, sessionId, sessions])

  const firstSelectedName =
    contacts.find((c) => selected.has(c.id))?.name ?? ''

  const preview = fillPreview(body, link, senderName, firstSelectedName)

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAddContact(e: FormEvent) {
    e.preventDefault()
    setContactError(null)
    if (!newName.trim() || !newPhone.trim()) {
      setContactError('Name and phone are required.')
      return
    }
    const err = await addContact(newName, newPhone, newConfirmed)
    if (err) setContactError(err)
    else {
      setNewName('')
      setNewPhone('')
      setNewConfirmed(true)
    }
  }

  async function handleSend() {
    setSendError(null)
    setResult(null)
    if (!link) {
      setSendError('Pick a session (or paste a review link) first.')
      return
    }
    if (selected.size === 0) {
      setSendError('Select at least one contact.')
      return
    }
    setSending(true)
    try {
      const res = await sendQuoText({
        link,
        message: body,
        contactIds: [...selected],
        sessionId: sessionId || undefined,
        projectId: projectId || undefined,
        senderName,
      })
      setResult(res)
      if (!res.ok && res.error) setSendError(res.error)
      fetchCounts()
    } catch (err) {
      setSendError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  async function handleSaveTemplate() {
    if (!tplName.trim() || !body.trim()) return
    const err = await addTemplate(tplName, body)
    if (!err) setTplName('')
  }

  return (
    <div className="h-full overflow-y-auto bg-surface-secondary">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Header + counts */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-text-primary">
              <MessageSquare className="h-6 w-6 text-brand-600" />
              Contacts &amp; Texting
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Save people, text them a review link as a group chat, and let the AI assistant help.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5">
              <ArrowUpRight className="h-4 w-4 text-brand-600" />
              <div>
                <p className="text-lg font-bold leading-none text-text-primary">{counts.sent}</p>
                <p className="text-xs text-text-muted">sent</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5">
              <ArrowDownLeft className="h-4 w-4 text-goblin-green" />
              <div>
                <p className="text-lg font-bold leading-none text-text-primary">{counts.received}</p>
                <p className="text-xs text-text-muted">received</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Compose / send */}
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold text-text-primary">Text a review link</h2>

              {/* session / link */}
              <label className="mt-4 block text-xs font-medium text-text-secondary">
                Review link
              </label>
              <select
                value={sessionId}
                onChange={(e) => {
                  setSessionId(e.target.value)
                  setManualLink('')
                }}
                className="mt-1 w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">Select one of your sessions…</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <input
                value={manualLink}
                onChange={(e) => setManualLink(e.target.value)}
                placeholder="…or paste a review link directly"
                className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />

              {/* project — ties this send's replies to a project for coaching */}
              <label className="mt-4 block text-xs font-medium text-text-secondary">
                Project (so replies aggregate for coaching)
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {/* template + body */}
              <div className="mt-4 flex items-center justify-between">
                <label className="text-xs font-medium text-text-secondary">Message</label>
                <select
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value)
                    const t = templates.find((t) => t.id === e.target.value)
                    if (t) setBody(t.body)
                  }}
                  className="rounded-lg border border-border px-2 py-1 text-xs text-text-secondary focus:outline-none"
                >
                  <option value="">Templates…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <p className="mt-1 text-xs text-text-muted">
                Placeholders: <code>{'{{link}}'}</code> <code>{'{{name}}'}</code>{' '}
                <code>{'{{sender}}'}</code>
              </p>

              {/* preview */}
              <div className="mt-3 rounded-xl bg-surface-tertiary p-3">
                <p className="text-xs font-medium text-text-muted">Preview</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{preview}</p>
              </div>

              {/* save template */}
              <div className="mt-3 flex gap-2">
                <input
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  placeholder="Save current message as template…"
                  className="flex-1 rounded-xl border border-border px-3 py-2 text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <button
                  onClick={handleSaveTemplate}
                  disabled={!tplName.trim()}
                  className="flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-tertiary disabled:opacity-40"
                >
                  <Save className="h-3.5 w-3.5" /> Save
                </button>
              </div>

              {/* send */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-text-muted">
                  <Users className="mr-1 inline h-3.5 w-3.5" />
                  {selected.size} recipient{selected.size === 1 ? '' : 's'} selected
                </p>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send group text
                </button>
              </div>

              {sendError && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{sendError}</p>
              )}
              {result?.ok && (
                <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                  Sent to {result.sent} of {result.total} recipient{result.total === 1 ? '' : 's'}.
                </p>
              )}
            </section>

            {/* Contacts manager */}
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold text-text-primary">Your contacts</h2>

              <form onSubmit={handleAddContact} className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                  className="min-w-[120px] flex-1 rounded-xl border border-border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Phone (e.g. 415 555 0123)"
                  className="min-w-[160px] flex-1 rounded-xl border border-border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={newConfirmed}
                    onChange={(e) => setNewConfirmed(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Confirmed
                </label>
                <button
                  type="submit"
                  className="flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </form>
              {newPhone.trim() && (
                <p className="mt-1 text-xs text-text-muted">Will be saved as {normalizePhone(newPhone)}</p>
              )}
              {contactError && <p className="mt-2 text-xs text-red-600">{contactError}</p>}

              <div className="mt-4 divide-y divide-border">
                {loading && contacts.length === 0 && (
                  <p className="py-6 text-center text-sm text-text-muted">Loading…</p>
                )}
                {!loading && contacts.length === 0 && (
                  <p className="py-6 text-center text-sm text-text-muted">
                    No contacts yet. Add one above.
                  </p>
                )}
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">{c.name}</p>
                      <p className="flex items-center gap-1 text-xs text-text-muted">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleConfirmed(c.id, !c.confirmed)}
                      className={
                        c.confirmed
                          ? 'flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700'
                          : 'rounded-full border border-border px-2.5 py-1 text-xs text-text-muted hover:bg-surface-tertiary'
                      }
                      title={c.confirmed ? 'Confirmed' : 'Mark confirmed'}
                    >
                      {c.confirmed && <Check className="h-3 w-3" />}
                      {c.confirmed ? 'Confirmed' : 'Unconfirmed'}
                    </button>
                    <button
                      onClick={() => deleteContact(c.id)}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {templates.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-xs font-medium text-text-secondary">Saved templates</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {templates.map((t) => (
                      <span
                        key={t.id}
                        className="flex items-center gap-1.5 rounded-full bg-surface-tertiary px-3 py-1 text-xs text-text-secondary"
                      >
                        {t.name}
                        <button
                          onClick={() => deleteTemplate(t.id)}
                          className="text-text-muted hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Assistant */}
          <div className="lg:col-span-1">
            <ContactsAssistant />
          </div>
        </div>
      </div>
    </div>
  )
}
