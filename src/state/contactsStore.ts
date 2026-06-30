import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Contact, MessageTemplate, MessageCounts } from '../types'

interface ContactsState {
  contacts: Contact[]
  templates: MessageTemplate[]
  counts: MessageCounts
  loading: boolean
  error: string | null

  fetchAll: () => Promise<void>
  fetchCounts: () => Promise<void>

  addContact: (name: string, phone: string, confirmed: boolean) => Promise<string | null>
  toggleConfirmed: (id: string, confirmed: boolean) => Promise<void>
  deleteContact: (id: string) => Promise<void>

  addTemplate: (name: string, body: string) => Promise<string | null>
  deleteTemplate: (id: string) => Promise<void>
}

// Normalize loose phone input toward E.164. Defaults a bare 10-digit number to
// US (+1). Anything already starting with + is left intact.
export function normalizePhone(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '')
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  templates: [],
  counts: { sent: 0, received: 0 },
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    const [contactsRes, templatesRes] = await Promise.all([
      supabase.from('contacts').select('*').order('created_at', { ascending: false }),
      supabase.from('message_templates').select('*').order('created_at', { ascending: false }),
    ])
    if (contactsRes.error || templatesRes.error) {
      set({ loading: false, error: contactsRes.error?.message || templatesRes.error?.message || 'Load failed' })
      return
    }
    set({
      contacts: (contactsRes.data as Contact[]) ?? [],
      templates: (templatesRes.data as MessageTemplate[]) ?? [],
      loading: false,
    })
    get().fetchCounts()
  },

  fetchCounts: async () => {
    const [sentRes, recvRes] = await Promise.all([
      supabase.from('messages_log').select('id', { count: 'exact', head: true }).eq('direction', 'outgoing'),
      supabase.from('messages_log').select('id', { count: 'exact', head: true }).eq('direction', 'incoming'),
    ])
    set({
      counts: {
        sent: sentRes.count ?? 0,
        received: recvRes.count ?? 0,
      },
    })
  },

  addContact: async (name, phone, confirmed) => {
    const { data: userData } = await supabase.auth.getUser()
    const ownerId = userData.user?.id
    if (!ownerId) return 'Not signed in'
    const { data, error } = await supabase
      .from('contacts')
      .insert({ owner_id: ownerId, name: name.trim(), phone: normalizePhone(phone), confirmed })
      .select()
      .single()
    if (error) return error.message
    set((s) => ({ contacts: [data as Contact, ...s.contacts] }))
    return null
  },

  toggleConfirmed: async (id, confirmed) => {
    set((s) => ({ contacts: s.contacts.map((c) => (c.id === id ? { ...c, confirmed } : c)) }))
    await supabase.from('contacts').update({ confirmed }).eq('id', id)
  },

  deleteContact: async (id) => {
    set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) }))
    await supabase.from('contacts').delete().eq('id', id)
  },

  addTemplate: async (name, body) => {
    const { data: userData } = await supabase.auth.getUser()
    const ownerId = userData.user?.id
    if (!ownerId) return 'Not signed in'
    const { data, error } = await supabase
      .from('message_templates')
      .insert({ owner_id: ownerId, name: name.trim(), body: body.trim() })
      .select()
      .single()
    if (error) return error.message
    set((s) => ({ templates: [data as MessageTemplate, ...s.templates] }))
    return null
  },

  deleteTemplate: async (id) => {
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }))
    await supabase.from('message_templates').delete().eq('id', id)
  },
}))
