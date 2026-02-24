-- Add optional max recording duration (in seconds) to sessions
alter table sessions add column max_duration integer;
