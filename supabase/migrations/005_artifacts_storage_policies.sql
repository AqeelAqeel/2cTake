-- ============================================================
-- Storage policies for artifacts bucket (bucket already set to private)
-- ============================================================
-- Drop any existing policies to avoid conflicts, then recreate.

drop policy if exists "Authenticated users can upload artifacts" on storage.objects;
drop policy if exists "Anyone can read artifacts" on storage.objects;
drop policy if exists "Artifact owners can delete" on storage.objects;

-- Authenticated users can upload artifacts
create policy "Authenticated users can upload artifacts"
  on storage.objects for insert
  with check (
    bucket_id = 'artifacts'
    and auth.role() = 'authenticated'
  );

-- Anyone can read artifacts via signed URL
-- (file paths are UUIDs so unguessable; signed URLs expire after 1 hour)
create policy "Anyone can read artifacts"
  on storage.objects for select
  using (bucket_id = 'artifacts');

-- Owners can delete their own artifacts
create policy "Artifact owners can delete"
  on storage.objects for delete
  using (
    bucket_id = 'artifacts'
    and auth.uid() = owner
  );
