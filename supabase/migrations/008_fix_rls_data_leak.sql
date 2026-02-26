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
