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
CREATE POLICY "Anon can read artifacts for review"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'artifacts');
