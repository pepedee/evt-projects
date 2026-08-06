-- 0013_restore_auth.sql
-- Restores real authentication, reversing 0012_open_access.sql.
--
-- Everything this needs was already here and untouched: 0006_rls.sql's
-- policies, 0007_signup.sql's handle_new_user()/ensure_workspace()
-- functions, and 0001_workspaces.sql's is_member()/has_role(). Only
-- current_workspace() and the signup trigger were actually changed by
-- 0012, so only those need reversing.

-- Back to resolving from the signed-in user's membership, not a fixed id.
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

-- Re-provision a workspace for every new signup again.
create trigger on_auth_user_created_tracker
  after insert on auth.users
  for each row execute function tracker.handle_new_user();

-- The fixed anonymous-era workspace has no members and nothing references
-- it (confirmed empty: 0 projects at the time of writing) — remove it
-- rather than leave a workspace nobody can ever sign in as.
delete from tracker.workspaces
where id = '00000000-0000-4000-8000-000000000001';
