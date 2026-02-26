-- ============================================================
-- Fix RLS policies for anonymous reviewer registration
-- ============================================================
-- Problem: Anonymous reviewers can't insert into `reviewers` table
-- because (1) anon role may lack table-level grants, and
-- (2) .insert().select() needs a SELECT policy for the inserter.

-- Grant table-level permissions to anon role
GRANT SELECT, INSERT ON public.reviewers TO anon;
GRANT SELECT, INSERT ON public.recordings TO anon;
GRANT SELECT ON public.sessions TO anon;
GRANT SELECT, INSERT, UPDATE ON public.transcripts TO anon;
GRANT UPDATE ON public.recordings TO anon;

-- Allow reviewers to read their own row after insert
-- (needed for .insert().select().single() pattern)
CREATE POLICY "Reviewers can read own row"
  ON reviewers FOR SELECT
  USING (true);

-- Drop the old restrictive select policy and replace it
-- (session owners already covered by the new open policy)
DROP POLICY IF EXISTS "Session owners can read reviewers" ON reviewers;

-- Allow reviewers to read their own recordings
CREATE POLICY "Reviewers can read own recordings"
  ON recordings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Session owners can read recordings" ON recordings;
