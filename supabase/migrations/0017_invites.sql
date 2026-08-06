-- 0017_invites.sql
-- Invite a not-yet-registered person by email. They land directly in the
-- inviter's workspace at signup instead of getting their own — the
-- alternative (an existing account joining a second workspace) would need a
-- workspace switcher, which this single-workspace-per-session app doesn't
-- have yet. Scope is deliberately just "invite someone who hasn't signed up".

create table if not exists tracker.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  email        text not null,
  role         text not null default 'member'
               check (role in ('owner', 'admin', 'member', 'viewer')),
  invited_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);

-- One pending invite per email at a time, case-insensitively. An account can
-- only land in one workspace at signup (see provision_workspace() below), so
-- a second pending invite for the same address would just be ambiguous.
create unique index if not exists workspace_invites_pending_email_idx
  on tracker.workspace_invites (lower(email))
  where accepted_at is null;

create index if not exists workspace_invites_workspace_idx
  on tracker.workspace_invites (workspace_id);

alter table tracker.workspace_invites enable row level security;

create policy workspace_invites_read on tracker.workspace_invites
  for select to authenticated using (tracker.is_member(workspace_id));

create policy workspace_invites_create on tracker.workspace_invites
  for insert to authenticated
  with check (
    tracker.has_role(workspace_id, 'admin')
    -- Only an owner may hand out ownership — an admin granting a co-equal
    -- role would be a privilege escalation.
    and (role <> 'owner' or tracker.has_role(workspace_id, 'owner'))
  );

create policy workspace_invites_delete on tracker.workspace_invites
  for delete to authenticated using (tracker.has_role(workspace_id, 'admin'));

-- ------------------------------------------------------- honor at signup
-- provision_workspace() (originally 0007) now checks for a pending invite
-- matching the new user's email before falling back to "make them a new
-- workspace of their own". Still SECURITY DEFINER, so it can see auth.users
-- and write workspace_members/workspace_invites for a user who isn't signed
-- in yet (this runs from the auth.users insert trigger).

create or replace function tracker.provision_workspace(
  p_user  uuid,
  p_name  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace uuid;
  invite        tracker.workspace_invites%rowtype;
  mail          text;
begin
  -- Already provisioned: hand back the existing workspace, do not make another.
  select m.workspace_id into new_workspace
  from tracker.workspace_members m
  where m.user_id = p_user
  order by m.created_at
  limit 1;

  if new_workspace is not null then
    return new_workspace;
  end if;

  select u.email into mail from auth.users u where u.id = p_user;

  if mail is not null then
    select * into invite
    from tracker.workspace_invites
    where lower(email) = lower(mail)
      and accepted_at is null
    order by created_at
    limit 1;
  end if;

  if invite.id is not null then
    insert into tracker.workspace_members (workspace_id, user_id, role, full_name)
    values (invite.workspace_id, p_user, invite.role, p_name);

    update tracker.workspace_invites
    set accepted_at = now()
    where id = invite.id;

    return invite.workspace_id;
  end if;

  insert into tracker.workspaces (name, created_by)
  values (p_name || '''s workspace', p_user)
  returning id into new_workspace;

  insert into tracker.workspace_members (workspace_id, user_id, role, full_name)
  values (new_workspace, p_user, 'owner', p_name);

  return new_workspace;
end;
$$;
