-- 0004_finance.sql
-- Planned budget versus what was actually spent.
--
-- Money is numeric(14,2), never a float. Neither table carries a currency:
-- the project owns one currency and everything under it inherits, so a rollup
-- can never silently add THB to USD.

create table if not exists tracker.budget_lines (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references tracker.workspaces(id) on delete cascade,
  project_id     uuid not null references tracker.projects(id) on delete cascade,
  category       text not null default 'general',
  description    text,
  planned_amount numeric(14,2) not null default 0 check (planned_amount >= 0),
  sort_order     int not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists budget_lines_project_idx
  on tracker.budget_lines (project_id, sort_order);

create table if not exists tracker.expenses (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references tracker.workspaces(id) on delete cascade,
  project_id          uuid not null references tracker.projects(id) on delete cascade,
  -- Unassigned expenses are allowed; they roll up to the project but sit
  -- outside any planned line, which is exactly what you want to see.
  budget_line_id      uuid references tracker.budget_lines(id) on delete set null,
  description         text not null,
  amount              numeric(14,2) not null check (amount >= 0),
  incurred_on         date not null default current_date,
  vendor              text,
  receipt_document_id uuid references tracker.documents(id) on delete set null,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists expenses_project_idx
  on tracker.expenses (project_id, incurred_on desc);
create index if not exists expenses_line_idx
  on tracker.expenses (budget_line_id);

create trigger budget_lines_set_workspace
  before insert or update of project_id on tracker.budget_lines
  for each row execute function tracker.set_workspace_from_project();

create trigger expenses_set_workspace
  before insert or update of project_id on tracker.expenses
  for each row execute function tracker.set_workspace_from_project();

create trigger budget_lines_touch before update on tracker.budget_lines
  for each row execute function tracker.touch_updated_at();
create trigger expenses_touch before update on tracker.expenses
  for each row execute function tracker.touch_updated_at();

-- An expense must sit under the same project as the budget line it is
-- charged to. Without this, a stray id would corrupt every variance figure.
create or replace function tracker.expenses_check_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line_project uuid;
begin
  if new.budget_line_id is null then
    return new;
  end if;
  select b.project_id into line_project
  from tracker.budget_lines b where b.id = new.budget_line_id;
  if line_project is distinct from new.project_id then
    raise exception 'budget line % belongs to a different project', new.budget_line_id;
  end if;
  return new;
end;
$$;

create trigger expenses_line_matches_project
  before insert or update of budget_line_id, project_id on tracker.expenses
  for each row execute function tracker.expenses_check_line();
