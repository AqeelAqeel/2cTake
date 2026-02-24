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
