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
