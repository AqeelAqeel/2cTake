-- 010: Add owner_display_name to sessions
--
-- Stores the session creator's display name so reviewers can see
-- who invited them without needing to query users_2ctake (which
-- is behind RLS). Populated at session creation time from the
-- authenticated user's Google profile.

ALTER TABLE sessions ADD COLUMN owner_display_name text;
