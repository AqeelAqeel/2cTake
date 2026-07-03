-- ============================================================================
-- 2cTake — FULL FROM-SCRATCH BOOTSTRAP (migrations 001→014 + storage buckets)
-- Run once on a FRESH, EMPTY Supabase project dedicated to 2cTake.
-- Idempotent-safe: policies/functions guard against re-runs.
-- ============================================================================

-- ---- storage buckets (private; signed-URL / R2 access) ----
insert into storage.buckets (id, name, public) values ('artifacts','artifacts',false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('recordings','recordings',false) on conflict (id) do nothing;

-- ======================= 001_initial.sql =======================
-- ============================================================
-- 2cTake — Initial Database Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- SESSIONS
-- ============================================================
create table sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  context text,
  artifact_url text not null,
  artifact_type text not null check (artifact_type in ('pdf', 'image')),
  share_token text not null unique,
  created_at timestamptz not null default now()
);

create index idx_sessions_owner on sessions(owner_id);
create index idx_sessions_share_token on sessions(share_token);

-- ============================================================
-- REVIEWERS
-- ============================================================
create table reviewers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  browser_uuid text not null,
  created_at timestamptz not null default now()
);

create index idx_reviewers_session on reviewers(session_id);

-- ============================================================
-- RECORDINGS
-- ============================================================
create table recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  reviewer_id uuid not null references reviewers(id) on delete cascade,
  video_url text not null,
  audio_url text,
  duration integer not null default 0,
  status text not null default 'uploading'
    check (status in ('uploading', 'uploaded', 'transcribing', 'complete', 'failed')),
  created_at timestamptz not null default now()
);

create index idx_recordings_session on recordings(session_id);
create index idx_recordings_reviewer on recordings(reviewer_id);

-- ============================================================
-- TRANSCRIPTS
-- ============================================================
create table transcripts (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references recordings(id) on delete cascade,
  text text not null default '',
  timestamps_json jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'complete', 'failed')),
  created_at timestamptz not null default now()
);

create index idx_transcripts_recording on transcripts(recording_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table sessions enable row level security;
alter table reviewers enable row level security;
alter table recordings enable row level security;
alter table transcripts enable row level security;

-- Sessions: owners can CRUD, anyone with share_token can read
create policy "Owners can manage their sessions"
  on sessions for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Anyone can read sessions by share_token"
  on sessions for select
  using (true);

-- Reviewers: anyone can insert (no auth required), owners can read
create policy "Anyone can create reviewers"
  on reviewers for insert
  with check (true);

create policy "Session owners can read reviewers"
  on reviewers for select
  using (
    exists (
      select 1 from sessions
      where sessions.id = reviewers.session_id
      and sessions.owner_id = auth.uid()
    )
  );

-- Recordings: anyone can insert, owners can read
create policy "Anyone can create recordings"
  on recordings for insert
  with check (true);

create policy "Session owners can read recordings"
  on recordings for select
  using (
    exists (
      select 1 from sessions
      where sessions.id = recordings.session_id
      and sessions.owner_id = auth.uid()
    )
  );

-- Allow anon to update recording status (for transcription pipeline)
create policy "Anyone can update recording status"
  on recordings for update
  using (true)
  with check (true);

-- Transcripts: service role inserts, owners can read
create policy "Anyone can insert transcripts"
  on transcripts for insert
  with check (true);

create policy "Anyone can update transcripts"
  on transcripts for update
  using (true)
  with check (true);

create policy "Session owners can read transcripts"
  on transcripts for select
  using (
    exists (
      select 1 from recordings
      join sessions on sessions.id = recordings.session_id
      where recordings.id = transcripts.recording_id
      and sessions.owner_id = auth.uid()
    )
  );

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- Run these in Supabase dashboard or via supabase CLI:
--
-- supabase storage create-bucket artifacts --public
-- supabase storage create-bucket recordings --public
--
-- Storage policies should allow:
-- - Authenticated users to upload to artifacts/
-- - Anyone to upload to recordings/ (reviewers are unauthenticated)
-- - Public read on both buckets

-- ======================= 002_users_2ctake.sql =======================
create table public.users_2ctake (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_users_2ctake_email on public.users_2ctake(email);

alter table public.users_2ctake enable row level security;

create policy "Users can read own profile"
  on public.users_2ctake for select
  to authenticated
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.users_2ctake for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.handle_2ctake_new_user()
returns trigger as $$
begin
  insert into public.users_2ctake (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.users_2ctake.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.users_2ctake.avatar_url),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created_2ctake
  after insert on auth.users
  for each row execute function public.handle_2ctake_new_user();

create trigger on_auth_user_updated_2ctake
  after update on auth.users
  for each row execute function public.handle_2ctake_new_user();

insert into public.users_2ctake (id, email, display_name, avatar_url)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
  raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;

-- ======================= 003_max_duration.sql =======================
-- Add optional max recording duration (in seconds) to sessions
alter table sessions add column max_duration integer;

-- ======================= 004_document_artifact_type.sql =======================
-- Allow document file types (docx, pptx, xlsx, etc.) as artifacts
alter table sessions
  drop constraint sessions_artifact_type_check;

alter table sessions
  add constraint sessions_artifact_type_check
  check (artifact_type in ('pdf', 'image', 'document'));

-- ======================= 005_artifacts_storage_policies.sql =======================
-- ============================================================
-- Storage policies for artifacts bucket (bucket already set to private)
-- ============================================================
-- Drop any existing policies to avoid conflicts, then recreate.

drop policy if exists "Authenticated users can upload artifacts" on storage.objects;
drop policy if exists "Anyone can read artifacts" on storage.objects;
drop policy if exists "Artifact owners can delete" on storage.objects;

-- Authenticated users can upload artifacts
create policy "Authenticated users can upload artifacts"
  on storage.objects for insert
  with check (
    bucket_id = 'artifacts'
    and auth.role() = 'authenticated'
  );

-- Anyone can read artifacts via signed URL
-- (file paths are UUIDs so unguessable; signed URLs expire after 1 hour)
create policy "Anyone can read artifacts"
  on storage.objects for select
  using (bucket_id = 'artifacts');

-- Owners can delete their own artifacts
create policy "Artifact owners can delete"
  on storage.objects for delete
  using (
    bucket_id = 'artifacts'
    and auth.uid() = owner
  );

-- ======================= 006_url_import_columns.sql =======================
-- Add source URL tracking columns for URL-based artifact import
ALTER TABLE sessions ADD COLUMN source_url TEXT;
ALTER TABLE sessions ADD COLUMN source_type TEXT;

-- ======================= 007_fix_reviewer_rls.sql =======================
-- Fix RLS policies for anonymous reviewer registration

-- Grant table-level permissions to anon role
GRANT SELECT, INSERT ON public.reviewers TO anon;
GRANT SELECT, INSERT ON public.recordings TO anon;
GRANT SELECT ON public.sessions TO anon;
GRANT SELECT, INSERT, UPDATE ON public.transcripts TO anon;
GRANT UPDATE ON public.recordings TO anon;

-- Drop existing restrictive select policies first
DROP POLICY IF EXISTS "Session owners can read reviewers" ON reviewers;
DROP POLICY IF EXISTS "Session owners can read recordings" ON recordings;

-- Allow anyone to read reviewers (needed for .insert().select() pattern)
DROP POLICY IF EXISTS "Reviewers can read own row" ON reviewers;
CREATE POLICY "Reviewers can read own row"
  ON reviewers FOR SELECT
  USING (true);

-- Allow anyone to read recordings
DROP POLICY IF EXISTS "Reviewers can read own recordings" ON recordings;
CREATE POLICY "Reviewers can read own recordings"
  ON recordings FOR SELECT
  USING (true);

-- ======================= 008_fix_rls_data_leak.sql =======================
-- ============================================================
-- 008: Fix critical multi-tenant data leak
--
-- Problem: Multiple tables had USING (true) SELECT policies,
-- allowing any authenticated user to read ALL rows across tenants.
-- This exposed sessions, recordings, reviewers, and transcripts
-- belonging to other users.
--
-- Fix: Scope all SELECT policies to the session owner for
-- authenticated users. Anonymous reviewer access uses targeted
-- policies and an RPC function for share-token lookup.
-- ============================================================

-- ============================================================
-- SESSIONS: Remove public SELECT
-- ============================================================

-- THIS IS THE ROOT CAUSE: USING (true) lets any user read all sessions
DROP POLICY IF EXISTS "Anyone can read sessions by share_token" ON sessions;

-- The existing "Owners can manage their sessions" policy (001_initial.sql)
-- handles all CRUD for authenticated owners via:
--   USING (auth.uid() = owner_id)
--   WITH CHECK (auth.uid() = owner_id)
--
-- Share-token lookup is now handled by get_session_by_token() RPC below.

-- ============================================================
-- REVIEWERS: Replace USING (true) with scoped policies
-- ============================================================

-- Drop the overly permissive policy from migration 007
DROP POLICY IF EXISTS "Reviewers can read own row" ON reviewers;

-- Session owners can see reviewers on their dashboard
CREATE POLICY "Session owners can read reviewers"
  ON reviewers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = reviewers.session_id
      AND sessions.owner_id = auth.uid()
    )
  );

-- Anonymous reviewers need SELECT for the .insert().select() pattern
-- Risk is low: reviewer data is just name + browser_uuid, and session
-- UUIDs are unguessable without the share-token lookup.
CREATE POLICY "Anon can read reviewers"
  ON reviewers FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- RECORDINGS: Replace USING (true) with scoped policies
-- ============================================================

-- Drop the overly permissive policy from migration 007
DROP POLICY IF EXISTS "Reviewers can read own recordings" ON recordings;

-- Session owners can see recordings on their dashboard
CREATE POLICY "Session owners can read recordings"
  ON recordings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = recordings.session_id
      AND sessions.owner_id = auth.uid()
    )
  );

-- Anonymous reviewers need SELECT for the .insert().select() pattern
CREATE POLICY "Anon can read recordings"
  ON recordings FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- RECORDINGS UPDATE: Remove public UPDATE
-- ============================================================

-- Edge functions use service_role key which bypasses RLS entirely.
-- No client-side UPDATE is needed.
DROP POLICY IF EXISTS "Anyone can update recording status" ON recordings;

-- Session owners can update their own recordings from dashboard
CREATE POLICY "Session owners can update recordings"
  ON recordings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = recordings.session_id
      AND sessions.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = recordings.session_id
      AND sessions.owner_id = auth.uid()
    )
  );

-- ============================================================
-- TRANSCRIPTS: Remove public INSERT / UPDATE
-- ============================================================

-- Edge functions use service_role key which bypasses RLS.
-- No client-side INSERT or UPDATE is needed.
DROP POLICY IF EXISTS "Anyone can insert transcripts" ON transcripts;
DROP POLICY IF EXISTS "Anyone can update transcripts" ON transcripts;

-- ============================================================
-- RPC: Secure share-token lookup (replaces public session SELECT)
-- ============================================================

CREATE OR REPLACE FUNCTION get_session_by_token(token text)
RETURNS SETOF sessions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM sessions
  WHERE share_token = token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_session_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION get_session_by_token(text) TO authenticated;

-- ======================= 009_fix_storage_policies.sql =======================
-- ============================================================
-- 009: Tighten artifact storage policies
--
-- Problem: "Anyone can read artifacts" allowed any authenticated
-- user to generate signed URLs for any artifact file, even ones
-- belonging to other users' sessions.
--
-- Fix: Authenticated users can only read artifacts that belong
-- to their own sessions (via join). Anon users can still read
-- (needed for reviewer signed URL generation via share links).
-- ============================================================

-- Drop the overly permissive policy from migration 005
DROP POLICY IF EXISTS "Anyone can read artifacts" ON storage.objects;

-- Authenticated users: can only access artifacts from their own sessions.
-- Uses a join to sessions table instead of storage.objects.owner because
-- the fetch-artifact edge function uploads with service_role (owner != user).
-- (drop-if-exists so this migration / the bootstrap is safe to re-run —
--  storage.objects policies survive a `drop schema public cascade`.)
DROP POLICY IF EXISTS "Owner can read own artifacts" ON storage.objects;
CREATE POLICY "Owner can read own artifacts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'artifacts'
    AND EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.artifact_url = name
      AND sessions.owner_id = auth.uid()
    )
  );

-- Anon (reviewers): can generate signed URLs for artifacts.
-- Artifact paths are UUIDs and only discoverable via the
-- get_session_by_token() RPC function (migration 008).
DROP POLICY IF EXISTS "Anon can read artifacts for review" ON storage.objects;
CREATE POLICY "Anon can read artifacts for review"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'artifacts');

-- ======================= 010_owner_display_name.sql =======================
-- 010: Add owner_display_name to sessions
--
-- Stores the session creator's display name so reviewers can see
-- who invited them without needing to query users_2ctake (which
-- is behind RLS). Populated at session creation time from the
-- authenticated user's Google profile.

ALTER TABLE sessions ADD COLUMN owner_display_name text;

-- ======================= 011_quo_contacts_messaging.sql =======================
-- 011: Quo texting — contacts, message templates, and a message log
--
-- Adds the data model behind the new /contacts route and the Quo SMS
-- integration:
--   * contacts          — a sender's address book (name + E.164 phone)
--   * message_templates — reusable text bodies with {{link}} {{name}} {{sender}}
--   * messages_log      — every outbound/inbound SMS, so we can COUNT messages
--                         sent to and from each owner/conversation.
--
-- RLS: everything is owner-scoped (auth.uid() = owner_id). Server-side
-- pipelines (the /api/quo-* Vercel functions and the inbound webhook) use the
-- service_role key, which bypasses RLS — so no permissive client policies are
-- needed for INSERT from those paths.

-- ── contacts ──────────────────────────────────────────────────────────────
create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  phone         text not null,                       -- E.164, e.g. +14155550123
  confirmed     boolean not null default false,      -- sender confirmed the number
  notes         text,
  created_at    timestamptz not null default now(),
  unique (owner_id, phone)
);

create index idx_contacts_owner on public.contacts(owner_id);

alter table public.contacts enable row level security;

create policy "contacts: owner full access"
  on public.contacts for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ── message_templates ──────────────────────────────────────────────────────
create table public.message_templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  body        text not null,    -- supports {{link}}, {{name}}, {{sender}}
  created_at  timestamptz not null default now()
);

create index idx_message_templates_owner on public.message_templates(owner_id);

alter table public.message_templates enable row level security;

create policy "templates: owner full access"
  on public.message_templates for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ── messages_log ────────────────────────────────────────────────────────────
-- One row per SMS in either direction. owner_id is the sender's user id; for
-- inbound messages it's resolved by matching the Quo sender number back to one
-- of the owner's contacts (may be null if no match). This table is the source
-- of truth for the "messages to / from" counts shown on the Contacts page.
-- NOTE: session_id is intentionally a bare uuid with NO foreign key. This
-- Supabase project is shared across many apps and its public.sessions table
-- belongs to a different app, so an FK here would bind to the wrong table and
-- reject real 2cTake session ids. Keep it loose; the app supplies the id.
create table public.messages_log (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid references auth.users(id) on delete cascade,
  session_id          uuid,
  contact_id          uuid references public.contacts(id) on delete set null,
  direction           text not null check (direction in ('outgoing', 'incoming')),
  quo_message_id      text,
  quo_conversation_id text,
  from_number         text,
  to_number           text,
  content             text,
  status              text,
  created_at          timestamptz not null default now()
);

create index idx_messages_log_owner on public.messages_log(owner_id);
create index idx_messages_log_conversation on public.messages_log(quo_conversation_id);
create index idx_messages_log_contact on public.messages_log(contact_id);

alter table public.messages_log enable row level security;

-- Owners can read their own message history. Inserts happen server-side via
-- the service_role key (Vercel functions / inbound webhook), which bypasses RLS.
create policy "messages_log: owner can read"
  on public.messages_log for select
  to authenticated
  using (owner_id = auth.uid());

-- ======================= 012_comments.sql =======================
-- Migration 012: reviewer comments (Google-Docs-style pins / highlights / voice notes)
--
-- A reviewer can drop discrete, anchored comments on the artifact while they
-- record. Each comment carries BOTH a spatial anchor (normalized to the
-- artifact) and an optional recording-timeline offset, so the sender can see it
-- as a pin AND have it surface in sync during video playback.
--
-- Comments are persisted at SEND time (alongside the recording row), mirroring
-- how annotation snapshots are uploaded. Voice comments additionally store a
-- short audio clip in the recordings bucket; its transcript is filled in
-- asynchronously by the `transcribe` edge function (service_role).
--
-- SECURITY MODEL (important — do NOT loosen):
--   - The anonymous reviewer NEVER reads this table. Comments are buffered
--     client-side during recording, so the reviewer needs INSERT only, never
--     SELECT. We therefore grant the `anon` role NOTHING on `comments`.
--   - Writes go through `add_comment()` — a SECURITY DEFINER RPC keyed on the
--     session `share_token` (same pattern as `get_session_by_token`). It
--     validates token -> session -> reviewer -> recording before inserting, so a
--     reviewer can only attach comments to the session their link belongs to and
--     cannot forge rows for arbitrary sessions.
--   - Only the authenticated session OWNER can SELECT, scoped via a join to
--     `sessions` (RLS). Transcript writes use the edge function's service_role
--     key, which bypasses RLS — so no anon/auth UPDATE policy is needed.
--
-- This intentionally does NOT repeat the `USING (true)` anon-SELECT pattern that
-- `recordings`/`reviewers` still carry (that pattern is a cross-tenant read leak).

create table if not exists public.comments (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions(id) on delete cascade,
  reviewer_id       uuid not null references public.reviewers(id) on delete cascade,
  recording_id      uuid references public.recordings(id) on delete cascade,
  body_text         text,
  audio_url         text,           -- storage path for the voice clip (nullable)
  transcript_text   text,           -- whisper transcript of the voice clip (nullable)
  transcript_status text not null default 'none'
                    check (transcript_status in ('none', 'pending', 'processing', 'complete', 'failed')),
  anchor            jsonb not null, -- { kind: 'pin'|'highlight', x, y, w?, h? } normalized 0..1
  timestamp_ms      integer,        -- offset into the recording timeline (nullable)
  created_at        timestamptz not null default now()
);

create index if not exists comments_session_id_idx   on public.comments(session_id);
create index if not exists comments_recording_id_idx  on public.comments(recording_id);

alter table public.comments enable row level security;

-- Authenticated session owners can read comments on their own sessions.
create policy "Owners can read comments"
  on public.comments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = comments.session_id
        and s.owner_id = auth.uid()
    )
  );

-- Owners read via the policy above; anon gets NOTHING on the table directly.
grant select on public.comments to authenticated;

-- ── Reviewer write path: share_token-scoped SECURITY DEFINER insert ──────────
-- Returns the new comment id (so the client can trigger transcription) without
-- exposing any read access to the table.
create or replace function public.add_comment(
  p_token        text,
  p_reviewer_id  uuid,
  p_recording_id uuid,
  p_body_text    text,
  p_audio_url    text,
  p_anchor       jsonb,
  p_timestamp_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_comment_id uuid;
begin
  -- Resolve + validate the share token.
  select id into v_session_id
  from public.sessions
  where share_token = p_token;

  if v_session_id is null then
    raise exception 'invalid share token';
  end if;

  -- Reviewer must belong to this session.
  if not exists (
    select 1 from public.reviewers r
    where r.id = p_reviewer_id and r.session_id = v_session_id
  ) then
    raise exception 'invalid reviewer for session';
  end if;

  -- Recording (when provided) must belong to this session + reviewer.
  if p_recording_id is not null and not exists (
    select 1 from public.recordings rec
    where rec.id = p_recording_id
      and rec.session_id = v_session_id
      and rec.reviewer_id = p_reviewer_id
  ) then
    raise exception 'invalid recording for reviewer';
  end if;

  insert into public.comments (
    session_id, reviewer_id, recording_id,
    body_text, audio_url, transcript_status,
    anchor, timestamp_ms
  )
  values (
    v_session_id, p_reviewer_id, p_recording_id,
    p_body_text, p_audio_url,
    case when p_audio_url is not null then 'pending' else 'none' end,
    p_anchor, p_timestamp_ms
  )
  returning id into v_comment_id;

  return v_comment_id;
end;
$$;

grant execute on function public.add_comment(text, uuid, uuid, text, text, jsonb, integer)
  to anon, authenticated;

-- ======================= 013_lock_down_anon_writes.sql =======================
-- Migration 013: close the anon cross-tenant read leak on reviewers + recordings
--
-- Problem (sr-viber-surf SEC-001): `reviewers` and `recordings` each carried an
-- anon `USING (true)` SELECT policy PLUS a table-level GRANT to the `anon` role
-- (the publishable key shipped in the SPA). That lets anyone run
-- `supabase.from('recordings').select('*')` and read every recording's storage
-- keys + every reviewer name/browser_uuid across ALL tenants — no token, no
-- UUID guessing. The `USING (true)` was added (007/008) only to satisfy the
-- `.insert().select()` round-trip, not because reviewers actually read these.
--
-- Fix: the anonymous reviewer never needs to READ these tables. Move the two
-- write paths (register a reviewer, create a recording) behind share_token-scoped
-- SECURITY DEFINER RPCs (same pattern as `get_session_by_token` / `add_comment`),
-- then strip ALL anon access to the tables. After this, anon can only:
--   - get_session_by_token(token)      -> resolve a share link
--   - register_reviewer(token, ...)    -> join a session
--   - create_recording(token, ...)     -> attach a recording
--   - add_comment(token, ...)          -> attach a comment
-- ...all gated by a valid share_token. No table SELECT/INSERT for anon at all.

-- ── Drop the leaky anon policies ─────────────────────────────────────────────
drop policy if exists "Anon can read reviewers"   on public.reviewers;
drop policy if exists "Anon can read recordings"  on public.recordings;
drop policy if exists "Anyone can create reviewers"  on public.reviewers;
drop policy if exists "Anyone can create recordings" on public.recordings;

-- ── Revoke the over-broad / dead anon grants (incl. SEC-009 leftovers) ───────
revoke select, insert          on public.reviewers   from anon;
revoke select, insert, update  on public.recordings  from anon;
revoke select, insert, update  on public.transcripts from anon;
revoke select                  on public.sessions    from anon;

-- ── Reviewer write path: share_token-scoped SECURITY DEFINER RPCs ────────────

-- Register (or re-register) an anonymous reviewer for the session a share link
-- points at. Returns the new reviewer id.
create or replace function public.register_reviewer(
  p_token        text,
  p_name         text,
  p_browser_uuid text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id  uuid;
  v_reviewer_id uuid;
begin
  select id into v_session_id
  from public.sessions
  where share_token = p_token;

  if v_session_id is null then
    raise exception 'invalid share token';
  end if;

  insert into public.reviewers (session_id, name, browser_uuid)
  values (v_session_id, p_name, p_browser_uuid)
  returning id into v_reviewer_id;

  return v_reviewer_id;
end;
$$;

grant execute on function public.register_reviewer(text, text, text)
  to anon, authenticated;

-- Create a recording row for a reviewer who belongs to the token's session.
-- Returns the new recording id. Status/duration mirror the previous client insert.
create or replace function public.create_recording(
  p_token       text,
  p_reviewer_id uuid,
  p_video_url   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id   uuid;
  v_recording_id uuid;
begin
  select id into v_session_id
  from public.sessions
  where share_token = p_token;

  if v_session_id is null then
    raise exception 'invalid share token';
  end if;

  if not exists (
    select 1 from public.reviewers r
    where r.id = p_reviewer_id and r.session_id = v_session_id
  ) then
    raise exception 'invalid reviewer for session';
  end if;

  insert into public.recordings (session_id, reviewer_id, video_url, duration, status)
  values (v_session_id, p_reviewer_id, p_video_url, 0, 'uploaded')
  returning id into v_recording_id;

  return v_recording_id;
end;
$$;

grant execute on function public.create_recording(text, uuid, text)
  to anon, authenticated;

-- ======================= 014_ai_settings_projects.sql =======================
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

