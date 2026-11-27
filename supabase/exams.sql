-- The official model exams (PLAN 9.11): a private storage space ("bucket") called exams.
-- Run this once in Supabase: SQL Editor > New query > paste > Run. It can be run again safely.
--
-- The files (made by exams/export_dele.py, uploaded on the admin page of the website) are not
-- public: only people logged in whose account has access can read them, and only an admin can
-- upload, replace or delete them.

insert into storage.buckets (id, name, public)
values ('exams', 'exams', false)
on conflict (id) do update set public = false;

drop policy if exists "exams: read with access" on storage.objects;
create policy "exams: read with access" on storage.objects
  for select to authenticated
  using (bucket_id = 'exams' and public.has_access());

drop policy if exists "exams: admin uploads" on storage.objects;
create policy "exams: admin uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'exams' and public.is_admin());

drop policy if exists "exams: admin replaces" on storage.objects;
create policy "exams: admin replaces" on storage.objects
  for update to authenticated
  using (bucket_id = 'exams' and public.is_admin())
  with check (bucket_id = 'exams' and public.is_admin());

drop policy if exists "exams: admin deletes" on storage.objects;
create policy "exams: admin deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'exams' and public.is_admin());
