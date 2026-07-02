-- ┌──────────────────────────────────────────────────────────────────────┐
-- │ Paste this whole file into the Supabase SQL editor of the project that │
-- │ OWNS the 2cTake schema (run the preflight in current-state.md §11      │
-- │ first — all 4 core tables must exist). Migrations 012 then 013.        │
-- └──────────────────────────────────────────────────────────────────────┘

-- ===================== 012_comments.sql =====================
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

-- ===================== 013_lock_down_anon_writes.sql =====================
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
