import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Used by every /api function for the
// privileged reads/writes the browser can't make. NEVER VITE_-prefix the key.
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase service credentials not configured')
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

// Resolve the authenticated sender from a Supabase JWT in the Authorization
// header. Returns null when the header is missing or the token is invalid.
export async function getUserFromJwt(
  req: Request,
  sb: SupabaseClient
): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get('authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null
  const { data, error } = await sb.auth.getUser(jwt)
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? undefined }
}
