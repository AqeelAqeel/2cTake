import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Save, Loader2, Check } from 'lucide-react'
import { useSettingsStore } from '../state/settingsStore'

export function Settings() {
  const { settings, loading, saving, fetchSettings, saveSettings } = useSettingsStore()
  const [instructions, setInstructions] = useState('')
  const [tone, setTone] = useState('')
  const [goals, setGoals] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    if (settings) {
      setInstructions(settings.ai_instructions ?? '')
      setTone(settings.ai_tone ?? '')
      setGoals(settings.ai_goals ?? '')
    }
  }, [settings])

  async function handleSave() {
    setSaved(false)
    setError(null)
    const err = await saveSettings({
      ai_instructions: instructions.trim() || null,
      ai_tone: tone.trim() || null,
      ai_goals: goals.trim() || null,
    })
    if (err) setError(err)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-surface-secondary">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-text-primary">
          <SettingsIcon className="h-6 w-6 text-brand-600" />
          AI Context Settings
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          These defaults inform every AI touchpoint — the in-app assistant, the SMS bot that replies
          to your contacts, and the feedback coach. Projects can override them.
        </p>

        <section className="mt-6 space-y-5 rounded-xl border border-border bg-surface p-5">
          <div>
            <label className="text-xs font-medium text-text-secondary">
              How should the AI represent you / behave?
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              placeholder="e.g. Speak on behalf of Aqeel at Salience. Be warm, concise, and never over-promise. Nudge people to actually record their take."
              className="mt-1 w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Preferred tone</label>
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="e.g. warm and direct"
              className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Your goals</label>
            <input
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="e.g. collect candid feedback on my pitch deck from 10 advisors"
              className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saved' : 'Save settings'}
          </button>
        </section>
      </div>
    </div>
  )
}
