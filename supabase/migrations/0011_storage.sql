-- 0011_storage.sql
-- Private bucket for project files, with access gated on workspace membership.
--
-- Objects are stored as {workspace_id}/{project_id|general}/{timestamp}-{name}.
-- The policies below read the workspace out of the first path segment, so a
-- user can only ever touch bytes belonging to a workspace they are in.
-- Nothing in this bucket is public; the app hands out short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  20971520, -- 20 MB, matching MAX_UPLOAD_BYTES in lib/storage.ts
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv', 'text/plain',
    'application/zip'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = false;

/**
 * The workspace a storage path belongs to, or NULL if the first segment is not
 * a UUID. Returning NULL rather than raising matters: a single malformed
 * object name must not make the SELECT policy throw for every user.
 */
create or replace function tracker.path_workspace(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  segment text;
begin
  segment := split_part(p_name, '/', 1);
  if segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return segment::uuid;
  end if;
  return null;
end;
$$;

-- is_member(null) is false, so an unparseable path denies rather than leaks.
create policy tracker_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-files'
    and tracker.is_member(tracker.path_workspace(name))
  );

create policy tracker_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and tracker.has_role(tracker.path_workspace(name), 'member')
  );

create policy tracker_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'project-files'
    and tracker.has_role(tracker.path_workspace(name), 'member')
  )
  with check (
    bucket_id = 'project-files'
    and tracker.has_role(tracker.path_workspace(name), 'member')
  );

-- Members may delete, not just admins: the upload flow removes its own object
-- when recording the metadata row fails, and that must not need admin rights.
create policy tracker_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-files'
    and tracker.has_role(tracker.path_workspace(name), 'member')
  );
