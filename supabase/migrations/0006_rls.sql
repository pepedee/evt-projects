-- 0006_rls.sql
-- Row Level Security. The database, not the UI, decides who sees what.
--
-- Reading needs membership of the row's workspace. Writing needs at least
-- 'member' (so 'viewer' is genuinely read-only). Deleting needs 'admin'.
-- Every domain table carries workspace_id, so each policy is one indexed
-- predicate with no joins.

create or replace function tracker.apply_workspace_rls(p_table text)
returns void
language plpgsql
as $$
begin
  execute format('alter table tracker.%I enable row level security', p_table);

  execute format($f$create policy %I on tracker.%I for select to authenticated
                    using (tracker.is_member(workspace_id))$f$,
                 p_table || '_read', p_table);

  execute format($f$create policy %I on tracker.%I for insert to authenticated
                    with check (tracker.has_role(workspace_id, 'member'))$f$,
                 p_table || '_create', p_table);

  execute format($f$create policy %I on tracker.%I for update to authenticated
                    using (tracker.has_role(workspace_id, 'member'))
                    with check (tracker.has_role(workspace_id, 'member'))$f$,
                 p_table || '_update', p_table);

  execute format($f$create policy %I on tracker.%I for delete to authenticated
                    using (tracker.has_role(workspace_id, 'admin'))$f$,
                 p_table || '_delete', p_table);
end;
$$;

select tracker.apply_workspace_rls(t) from (values
  ('projects'),
  ('milestones'),
  ('tasks'),
  ('task_comments'),
  ('budget_lines'),
  ('expenses'),
  ('documents'),
  ('ai_summaries'),
  ('report_jobs')
) as x(t);

-- ------------------------------------------------------------- workspaces
alter table tracker.workspaces enable row level security;

create policy workspaces_read on tracker.workspaces
  for select to authenticated using (tracker.is_member(id));
create policy workspaces_update on tracker.workspaces
  for update to authenticated
  using (tracker.has_role(id, 'admin'))
  with check (tracker.has_role(id, 'admin'));
-- No insert policy: workspaces are created by the signup trigger in 0007,
-- which is SECURITY DEFINER. Add one when a "new workspace" screen exists.

-- ------------------------------------------------------ workspace_members
alter table tracker.workspace_members enable row level security;

create policy workspace_members_read on tracker.workspace_members
  for select to authenticated using (tracker.is_member(workspace_id));
create policy workspace_members_manage on tracker.workspace_members
  for all to authenticated
  using (tracker.has_role(workspace_id, 'admin'))
  with check (tracker.has_role(workspace_id, 'admin'));

-- ---------------------------------------------------------- activity_logs
-- Append-only: any member may write a line, members may read the history,
-- and nobody can edit or erase it. There is deliberately no update or delete
-- policy, so those operations are refused for every role.
alter table tracker.activity_logs enable row level security;

create policy activity_logs_insert on tracker.activity_logs
  for insert to authenticated
  with check (tracker.is_member(workspace_id));
create policy activity_logs_read on tracker.activity_logs
  for select to authenticated
  using (tracker.is_member(workspace_id));
