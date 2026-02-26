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
