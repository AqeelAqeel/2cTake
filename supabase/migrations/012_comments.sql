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
