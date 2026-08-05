-- 0012_open_access.sql
-- Removes authentication. The app is now open: no sign-in, one shared
-- workspace, everyone who can reach the app sees and edits the same data.
--
-- SECURITY NOTE. This is a deliberate reversal of the model in 0006_rls.sql.
-- Those policies are left in place but are no longer the gate, because the
-- server now connects with the service-role key, which bypasses RLS by design.
-- The protection that remains is network-level only: whoever can reach the
-- app can read and write everything in it. Do not expose this deployment
-- publicly without putting authentication back.

-- No auth.users rows exist any more, so the creator of a workspace is unknown.
alter table tracker.workspaces alter column created_by drop not null;

-- Signup no longer provisions anything: there is no signup.
drop trigger if exists on_auth_user_created_tracker on auth.users;

-- The one workspace everything hangs off. Its id is hard-coded in
-- lib/auth.ts as SHARED_WORKSPACE_ID — the two must match.
insert into tracker.workspaces (id, name, created_by)
values ('00000000-0000-4000-8000-000000000001', 'Shared workspace', null)
on conflict (id) do nothing;

-- current_workspace() previously resolved from the signed-in user's
-- membership. With no user, it returns the shared workspace instead.
create or replace function tracker.current_workspace()
returns uuid
language sql
immutable
as $$
  select '00000000-0000-4000-8000-000000000001'::uuid;
$$;
