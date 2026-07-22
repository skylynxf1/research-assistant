-- Cloud Run is the only storage client. The bucket stays private and no anon or
-- authenticated RLS policies are created; the backend secret key bypasses RLS.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'marginalia-papers',
  'marginalia-papers',
  false,
  31457280,
  array['application/pdf', 'application/json', 'image/png']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
