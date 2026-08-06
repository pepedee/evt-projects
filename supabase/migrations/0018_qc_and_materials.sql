-- 0018_qc_and_materials.sql
-- Two features found missing when comparing against a real, already-in-use
-- standalone tracker for one specific project: a per-unit QC pass/fail grid
-- (rows = work items, columns = physical units — e.g. 36 cooling-tower pipe
-- supports — each cell independently pass/fail/not-yet-inspected), and
-- materials/procurement tracking (qty × unit cost, supplier, a
-- needed/ordered/received/installed status) — distinct from budget_lines/
-- expenses, which track planned-vs-actual money, not procurement state.

-- --------------------------------------------------------------- materials
create table if not exists tracker.materials (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  project_id   uuid not null references tracker.projects(id) on delete cascade,
  name         text not null,
  qty          numeric(12,2) not null default 1 check (qty >= 0),
  unit_cost    numeric(14,2) not null default 0 check (unit_cost >= 0),
  supplier     text,
  status       text not null default 'needed'
               check (status in ('needed', 'ordered', 'received', 'installed')),
  notes        text,
  sort_order   int not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists materials_project_idx
  on tracker.materials (project_id, sort_order);

create trigger materials_set_workspace
  before insert or update of project_id on tracker.materials
  for each row execute function tracker.set_workspace_from_project();

create trigger materials_touch before update on tracker.materials
  for each row execute function tracker.touch_updated_at();

-- --------------------------------------------------------------- QC items
-- One row per work item being inspected (e.g. "Grind steel base surface"),
-- independent of tasks — a QC item is about inspection result, a task is
-- about work getting done, and not every project wants them coupled.
create table if not exists tracker.qc_items (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  project_id   uuid not null references tracker.projects(id) on delete cascade,
  item_no      text,
  description  text not null,
  sort_order   int not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists qc_items_project_idx
  on tracker.qc_items (project_id, sort_order);

create trigger qc_items_set_workspace
  before insert or update of project_id on tracker.qc_items
  for each row execute function tracker.set_workspace_from_project();

-- --------------------------------------------------------------- QC units
-- The columns of the grid — e.g. "CT-01".."CT-36" for a 36-unit scope.
-- A real row (not a project-level count) so units can be individually
-- labelled, added, and removed without renumbering everything else.
create table if not exists tracker.qc_units (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  project_id   uuid not null references tracker.projects(id) on delete cascade,
  label        text not null,
  sort_order   int not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists qc_units_project_idx
  on tracker.qc_units (project_id, sort_order);

create trigger qc_units_set_workspace
  before insert or update of project_id on tracker.qc_units
  for each row execute function tracker.set_workspace_from_project();

-- ------------------------------------------------------------- QC results
-- One cell of the grid. "Not yet inspected" is the absence of a row here —
-- not a third enum value — so clicking a cell to cycle it back to blank is
-- a real delete, not a status flag nobody ever queries around.
create table if not exists tracker.qc_results (
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  qc_item_id   uuid not null references tracker.qc_items(id) on delete cascade,
  qc_unit_id   uuid not null references tracker.qc_units(id) on delete cascade,
  result       text not null check (result in ('pass', 'fail')),
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (qc_item_id, qc_unit_id)
);

create index if not exists qc_results_unit_idx
  on tracker.qc_results (qc_unit_id);

create or replace function tracker.set_workspace_from_qc_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select i.workspace_id into new.workspace_id
  from tracker.qc_items i where i.id = new.qc_item_id;
  if new.workspace_id is null then
    raise exception 'qc_item % does not exist', new.qc_item_id;
  end if;
  return new;
end;
$$;

create trigger qc_results_set_workspace
  before insert or update of qc_item_id on tracker.qc_results
  for each row execute function tracker.set_workspace_from_qc_item();

-- ------------------------------------------------------------------- RLS
select tracker.apply_workspace_rls(t) from (values
  ('materials'),
  ('qc_items'),
  ('qc_units')
) as x(t);

-- qc_results is not apply_workspace_rls(): clearing a cell (cycling back to
-- blank) is a delete, and that's routine data entry here, not a destructive
-- admin action the way deleting a whole budget line is — so delete is
-- allowed at 'member' like the other writes, not gated at 'admin'.
alter table tracker.qc_results enable row level security;

create policy qc_results_read on tracker.qc_results
  for select to authenticated using (tracker.is_member(workspace_id));
create policy qc_results_write on tracker.qc_results
  for insert to authenticated
  with check (tracker.has_role(workspace_id, 'member'));
create policy qc_results_update on tracker.qc_results
  for update to authenticated
  using (tracker.has_role(workspace_id, 'member'))
  with check (tracker.has_role(workspace_id, 'member'));
create policy qc_results_delete on tracker.qc_results
  for delete to authenticated using (tracker.has_role(workspace_id, 'member'));
