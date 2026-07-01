import { useEffect, useState, type FormEvent } from 'react'
import { FolderKanban, Plus, Trash2, Save, Loader2, Check } from 'lucide-react'
import { useSettingsStore } from '../state/settingsStore'
import { CoachChat } from '../components/CoachChat'
import type { Project } from '../types'

export function Projects() {
  const { projects, fetchProjects, createProject, updateProject, deleteProject } = useSettingsStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  // per-project editor state
  const [ai, setAi] = useState('')
  const [savedAt, setSavedAt] = useState(false)
  const [savingAi, setSavingAi] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const selected = projects.find((p) => p.id === selectedId) ?? null

  useEffect(() => {
    setAi(selected?.ai_instructions ?? '')
    setSavedAt(false)
  }, [selectedId, selected?.ai_instructions])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const p = await createProject(newName, newDesc)
    setNewName('')
    setNewDesc('')
    if (p) setSelectedId(p.id)
  }

  async function saveAi() {
    if (!selected) return
    setSavingAi(true)
    await updateProject(selected.id, { ai_instructions: ai.trim() || null })
    setSavingAi(false)
    setSavedAt(true)
    setTimeout(() => setSavedAt(false), 2500)
  }

  async function remove(p: Project) {
    await deleteProject(p.id)
    if (selectedId === p.id) setSelectedId(null)
  }

  return (
    <div className="h-full overflow-y-auto bg-surface-secondary">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-text-primary">
          <FolderKanban className="h-6 w-6 text-brand-600" />
          Projects
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          A project is a thing you're getting feedback on. Give it its own AI context, then let the
          coach aggregate everything people said about it.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Project list + create */}
          <div className="space-y-4 lg:col-span-1">
            <form onSubmit={handleCreate} className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-text-primary">New project</p>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name (e.g. Series A deck)"
                className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What is it? (optional)"
                className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="submit"
                disabled={!newName.trim()}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Create
              </button>
            </form>

            <div className="rounded-xl border border-border bg-surface p-2">
              {projects.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-text-muted">No projects yet.</p>
              )}
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    selectedId === p.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-surface-tertiary'
                  }`}
                >
                  <span className="truncate font-medium">{p.name}</span>
                  <Trash2
                    className="h-3.5 w-3.5 shrink-0 text-text-muted hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(p)
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Selected project detail */}
          <div className="space-y-6 lg:col-span-2">
            {!selected ? (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-text-muted">
                Select or create a project to configure its AI context and coach.
              </div>
            ) : (
              <>
                <section className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="text-sm font-semibold text-text-primary">
                    AI context for “{selected.name}”
                  </h2>
                  <p className="mt-1 text-xs text-text-muted">
                    Layered on top of your global settings. Informs the SMS bot and coach for this
                    project.
                  </p>
                  <textarea
                    value={ai}
                    onChange={(e) => setAi(e.target.value)}
                    rows={4}
                    placeholder="e.g. This is feedback on our seed pitch deck. Push people for specifics on the go-to-market slide."
                    className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  <button
                    onClick={saveAi}
                    disabled={savingAi}
                    className="mt-3 flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {savingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAt ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                    {savedAt ? 'Saved' : 'Save context'}
                  </button>
                </section>

                <CoachChat key={selected.id} projectId={selected.id} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
