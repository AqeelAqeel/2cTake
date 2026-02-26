-- Add source URL tracking columns for URL-based artifact import
ALTER TABLE sessions ADD COLUMN source_url TEXT;
ALTER TABLE sessions ADD COLUMN source_type TEXT;
