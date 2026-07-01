// Loads a user's (and optionally a project's) AI context settings and composes
// them into an additional system prompt, so the assistant / SMS bot / coach are
// all "informed" by what the user configured. Uses the service-role client.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AiContext {
  systemAddon: string // ready-to-append system message ('' if nothing configured)
  userInstructions: string | null
  projectName: string | null
  projectInstructions: string | null
}

export async function loadAiContext(
  sb: SupabaseClient,
  ownerId: string | null,
  projectId?: string | null
): Promise<AiContext> {
  const ctx: AiContext = {
    systemAddon: '',
    userInstructions: null,
    projectName: null,
    projectInstructions: null,
  }
  if (!ownerId) return ctx

  const [{ data: settings }, projectRes] = await Promise.all([
    sb
      .from('user_settings')
      .select('ai_instructions, ai_tone, ai_goals')
      .eq('owner_id', ownerId)
      .maybeSingle(),
    projectId
      ? sb
          .from('projects')
          .select('name, description, ai_instructions')
          .eq('owner_id', ownerId)
          .eq('id', projectId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const lines: string[] = []
  if (settings?.ai_instructions) {
    ctx.userInstructions = settings.ai_instructions
    lines.push(`How this user wants you to behave: ${settings.ai_instructions}`)
  }
  if (settings?.ai_tone) lines.push(`Preferred tone: ${settings.ai_tone}`)
  if (settings?.ai_goals) lines.push(`Their goals: ${settings.ai_goals}`)

  const project = (projectRes as { data: { name?: string; description?: string; ai_instructions?: string } | null }).data
  if (project) {
    ctx.projectName = project.name ?? null
    ctx.projectInstructions = project.ai_instructions ?? null
    if (project.name) lines.push(`Current project: ${project.name}`)
    if (project.description) lines.push(`Project description: ${project.description}`)
    if (project.ai_instructions) lines.push(`Project-specific instructions: ${project.ai_instructions}`)
  }

  if (lines.length) {
    ctx.systemAddon =
      'The following context was configured by the user — honor it:\n' + lines.join('\n')
  }
  return ctx
}
