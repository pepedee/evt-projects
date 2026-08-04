-- 0003_documents.sql
-- Metadata for files held in the private Supabase Storage bucket.
-- The bytes live in storage; this table is the only index of them.
-- Uploading is two steps (browser -> storage, then a server action writes this
-- row), so the app removes the object again if this insert fails.

create table if not exists tracker.documents (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  project_id   uuid references tracker.projects(id) on delete cascade,
  task_id      uuid references tracker.tasks(id) on delete set null,
  file_name    text not null,
  storage_path text not null unique,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0),
  -- Re-uploading the same name against the same project bumps the version and
  -- points back at what it replaced, rather than destroying history.
  version      int not null default 1,
  replaces_id  uuid references tracker.documents(id) on delete set null,
  description  text,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists documents_project_idx
  on tracker.documents (project_id, created_at desc);
create index if not exists documents_workspace_idx
  on tracker.documents (workspace_id, created_at desc);
create index if not exists documents_task_idx
  on tracker.documents (task_id);

-- project_id is nullable here (a file can belong to the workspace rather than
-- to one project), so this cannot reuse set_workspace_from_project directly.
-- When a project is given, its workspace wins; otherwise the caller's value
-- stands and the RLS insert policy is what proves they belong to it.
create or replace function tracker.documents_set_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null then
    select p.workspace_id into new.workspace_id
    from tracker.projects p where p.id = new.project_id;
    if new.workspace_id is null then
      raise exception 'project % does not exist', new.project_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger documents_set_workspace
  before insert or update of project_id on tracker.documents
  for each row execute function tracker.documents_set_workspace();
