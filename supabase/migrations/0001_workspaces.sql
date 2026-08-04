-- 0001_workspaces.sql
-- The multi-user seam.
--
-- Today this is one workspace with one member. Every domain table carries a
-- workspace_id and every RLS policy asks tracker.is_member() / has_role(), so
-- inviting a second person later is an INSERT into workspace_members — not a
-- schema migration. If a future change needs new columns to support a second
-- user, the design has drifted.

create table if not exists tracker.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Roles are ranked, not free-form: viewer < member < admin < owner.
create table if not exists tracker.workspace_members (
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member'
               check (role in ('owner', 'admin', 'member', 'viewer')),
  full_name    text,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx
  on tracker.workspace_members (user_id);

create trigger workspaces_touch
  before update on tracker.workspaces
  for each row execute function tracker.touch_updated_at();

-- ---------------------------------------------------------------- helpers
-- All three are SECURITY DEFINER so that calling them from inside an RLS
-- policy does not re-enter RLS on workspace_members and recurse.

create or replace function tracker.role_rank(p_role text)
returns int
language sql
immutable
as $$
  select case p_role
    when 'owner'  then 4
    when 'admin'  then 3
    when 'member' then 2
    when 'viewer' then 1
    else 0
  end;
$$;

/** Is the signed-in user in this workspace at all? Governs every read. */
create or replace function tracker.is_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tracker.workspace_members m
    where m.workspace_id = p_workspace
      and m.user_id = auth.uid()
  );
$$;

/** Does the signed-in user hold at least p_min_role here? Governs writes. */
create or replace function tracker.has_role(p_workspace uuid, p_min_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tracker.workspace_members m
    where m.workspace_id = p_workspace
      and m.user_id = auth.uid()
      and tracker.role_rank(m.role) >= tracker.role_rank(p_min_role)
  );
$$;

/** The workspace to work in. Single-workspace today, so: the only one. */
create or replace function tracker.current_workspace()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.workspace_id
  from tracker.workspace_members m
  where m.user_id = auth.uid()
  order by m.created_at
  limit 1;
$$;
