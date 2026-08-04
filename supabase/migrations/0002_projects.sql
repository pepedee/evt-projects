-- 0002_projects.sql
-- Projects, milestones, tasks and comments.
--
-- Every table carries workspace_id even though it could be reached by joining
-- through project_id. That denormalisation is deliberate: RLS policies stay a
-- single indexed predicate instead of a join, which keeps them fast and easy
-- to read. A trigger fills the column from the parent, so the application can
-- never set it wrong.

create table if not exists tracker.projects (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references tracker.workspaces(id) on delete cascade,
  code            text,
  name            text not null,
  description     text,
  status          text not null default 'planning'
                  check (status in ('planning','active','on_hold','completed','cancelled')),
  priority        text not null default 'medium'
                  check (priority in ('low','medium','high','critical')),
  -- Effective health is derived at read time (it changes as dates pass, with
  -- no row being written). This column only records a human overriding that
  -- judgement: "I know the numbers look fine, it is off track."
  health_override text check (health_override in ('on_track','at_risk','off_track')),
  -- Maintained by trigger from task completion. Never written by the client.
  progress_pct    int not null default 0 check (progress_pct between 0 and 100),
  client_name     text,
  -- One currency per project. Budget lines and expenses inherit it, so a
  -- rollup can never silently add THB to USD. Multi-currency, if it is ever
  -- needed, is an additive migration.
  currency        text not null default 'THB',
  start_date      date,
  target_date     date,
  actual_end_date date,
  owner_id        uuid references auth.users(id) on delete set null,
  tags            text[] not null default '{}',
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists projects_workspace_idx
  on tracker.projects (workspace_id) where deleted_at is null;
create index if not exists projects_status_idx
  on tracker.projects (workspace_id, status) where deleted_at is null;
create unique index if not exists projects_code_key
  on tracker.projects (workspace_id, lower(code)) where code is not null and deleted_at is null;

create table if not exists tracker.milestones (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  project_id   uuid not null references tracker.projects(id) on delete cascade,
  name         text not null,
  description  text,
  due_date     date,
  status       text not null default 'pending'
               check (status in ('pending','in_progress','done')),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists milestones_project_idx
  on tracker.milestones (project_id, sort_order);

create table if not exists tracker.tasks (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references tracker.workspaces(id) on delete cascade,
  project_id     uuid not null references tracker.projects(id) on delete cascade,
  milestone_id   uuid references tracker.milestones(id) on delete set null,
  title          text not null,
  description    text,
  status         text not null default 'todo'
                 check (status in ('todo','in_progress','blocked','done','cancelled')),
  priority       text not null default 'medium'
                 check (priority in ('low','medium','high','critical')),
  assignee_id    uuid references auth.users(id) on delete set null,
  estimate_hours numeric(8,2) check (estimate_hours >= 0),
  spent_hours    numeric(8,2) not null default 0 check (spent_hours >= 0),
  start_date     date,
  due_date       date,
  completed_at   timestamptz,
  sort_order     int not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index if not exists tasks_project_idx
  on tracker.tasks (project_id, sort_order) where deleted_at is null;
create index if not exists tasks_assignee_idx
  on tracker.tasks (assignee_id) where deleted_at is null;
create index if not exists tasks_due_idx
  on tracker.tasks (workspace_id, due_date) where deleted_at is null and status <> 'done';

create table if not exists tracker.task_comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  task_id      uuid not null references tracker.tasks(id) on delete cascade,
  author_id    uuid references auth.users(id) on delete set null,
  body         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists task_comments_task_idx
  on tracker.task_comments (task_id, created_at);

-- ------------------------------------------------- workspace_id from parent
-- Fills workspace_id from the row's parent so the client never supplies it.

create or replace function tracker.set_workspace_from_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select p.workspace_id into new.workspace_id
  from tracker.projects p where p.id = new.project_id;
  if new.workspace_id is null then
    raise exception 'project % does not exist', new.project_id;
  end if;
  return new;
end;
$$;

create or replace function tracker.set_workspace_from_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select t.workspace_id into new.workspace_id
  from tracker.tasks t where t.id = new.task_id;
  if new.workspace_id is null then
    raise exception 'task % does not exist', new.task_id;
  end if;
  return new;
end;
$$;

create trigger milestones_set_workspace
  before insert or update of project_id on tracker.milestones
  for each row execute function tracker.set_workspace_from_project();

create trigger tasks_set_workspace
  before insert or update of project_id on tracker.tasks
  for each row execute function tracker.set_workspace_from_project();

create trigger task_comments_set_workspace
  before insert or update of task_id on tracker.task_comments
  for each row execute function tracker.set_workspace_from_task();

-- ------------------------------------------------------ derived progress
-- progress_pct is recomputed in the database whenever tasks change, so it can
-- never be spoofed by a client and can never drift from the task rows.
-- Cancelled tasks are excluded from both sides of the fraction.

create or replace function tracker.recompute_project_progress(p_project uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update tracker.projects p
  set progress_pct = coalesce((
    select round(
      100.0 * count(*) filter (where t.status = 'done')
      / nullif(count(*), 0)
    )
    from tracker.tasks t
    where t.project_id = p_project
      and t.deleted_at is null
      and t.status <> 'cancelled'
  ), 0)
  where p.id = p_project;
$$;

create or replace function tracker.tasks_touch_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform tracker.recompute_project_progress(old.project_id);
    return old;
  end if;

  perform tracker.recompute_project_progress(new.project_id);
  -- A task moved between projects: the old one loses a task.
  if tg_op = 'UPDATE' and old.project_id <> new.project_id then
    perform tracker.recompute_project_progress(old.project_id);
  end if;
  return new;
end;
$$;

create trigger tasks_progress
  after insert or update or delete on tracker.tasks
  for each row execute function tracker.tasks_touch_progress();

-- completed_at should follow status without the application remembering.
create or replace function tracker.tasks_sync_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_completed_at
  before insert or update on tracker.tasks
  for each row execute function tracker.tasks_sync_completed_at();

create trigger projects_touch before update on tracker.projects
  for each row execute function tracker.touch_updated_at();
create trigger milestones_touch before update on tracker.milestones
  for each row execute function tracker.touch_updated_at();
create trigger tasks_touch before update on tracker.tasks
  for each row execute function tracker.touch_updated_at();
