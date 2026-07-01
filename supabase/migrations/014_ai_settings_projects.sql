-- 014: AI context settings + projects + coaching plumbing
--
-- Adds the persistent "settings" layer the app needs:
--   * user_settings  — one row per owner: their default AI context (how the
--                      assistant/SMS bot should behave for them) + free-form prefs.
--   * projects       — a "thing you're getting feedback on" (an artifact/topic).
--                      Carries its OWN ai_instructions so the AI is informed
--                      per-project, layered on top of the user default.
--   * messages_log.project_id — ties each SMS to a project so feedback can be
--                      aggregated per project for coaching.
--
-- Multi-tenancy: everything is owner-scoped via RLS on auth.uid(). No table
-- correlates a username with a phone number across tenants — a row is only ever
-- visible to its owner. Server pipelines use service_role (bypasses RLS).

-- ── user_settings ───────────────────────────────────────────────────────────
create table public.user_settings (
  owner_id         uuid primary key references auth.users(id) on delete cascade,
  ai_instructions  text,   -- "how the AI should represent me / behave"
  ai_tone          text,   -- e.g. "warm and direct"
  ai_goals         text,   -- e.g. "help me collect candid design feedback"
  prefs            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings: owner full access"
  on public.user_settings for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ── projects ─────────────────────────────────────────────────────────────────
create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  description      text,
  ai_instructions  text,   -- per-project AI context (augments user_settings)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_projects_owner on public.projects(owner_id);

alter table public.projects enable row level security;

create policy "projects: owner full access"
  on public.projects for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ── link messages to a project ───────────────────────────────────────────────
alter table public.messages_log
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists idx_messages_log_project on public.messages_log(project_id);
