import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { UserSettings, Project } from '../types'

interface SettingsState {
  settings: Partial<UserSettings> | null
  projects: Project[]
  loading: boolean
  saving: boolean
  error: string | null

  fetchSettings: () => Promise<void>
  saveSettings: (patch: Pick<UserSettings, 'ai_instructions' | 'ai_tone' | 'ai_goals'>) => Promise<string | null>

  fetchProjects: () => Promise<void>
  createProject: (name: string, description: string) => Promise<Project | null>
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'ai_instructions'>>) => Promise<string | null>
  deleteProject: (id: string) => Promise<void>
}

async function ownerId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  projects: [],
  loading: false,
  saving: false,
  error: null,

  fetchSettings: async () => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.from('user_settings').select('*').maybeSingle()
    set({ settings: (data as UserSettings) ?? {}, loading: false, error: error?.message ?? null })
  },

  saveSettings: async (patch) => {
    set({ saving: true })
    const id = await ownerId()
    if (!id) {
      set({ saving: false })
      return 'Not signed in'
    }
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({ owner_id: id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' })
      .select()
      .single()
    set({ saving: false, settings: (data as UserSettings) ?? null, error: error?.message ?? null })
    return error?.message ?? null
  },

  fetchProjects: async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    set({ projects: (data as Project[]) ?? [], error: error?.message ?? null })
  },

  createProject: async (name, description) => {
    const id = await ownerId()
    if (!id) return null
    const { data, error } = await supabase
      .from('projects')
      .insert({ owner_id: id, name: name.trim(), description: description.trim() || null })
      .select()
      .single()
    if (error) {
      set({ error: error.message })
      return null
    }
    set((s) => ({ projects: [data as Project, ...s.projects] }))
    return data as Project
  },

  updateProject: async (id, patch) => {
    const { data, error } = await supabase
      .from('projects')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return error.message
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? (data as Project) : p)) }))
    return null
  },

  deleteProject: async (id) => {
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
    await supabase.from('projects').delete().eq('id', id)
  },
}))
