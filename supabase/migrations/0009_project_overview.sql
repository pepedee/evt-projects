-- 0009_project_overview.sql
-- One row per project with its task counts already aggregated.
--
-- Every project list needs "how many tasks, how many done, how many overdue"
-- to show progress and derive health. Doing that per project from the app
-- would be a query per row; doing it here is one indexed pass.
--
-- security_invoker = true is essential: without it the view would run as its
-- owner and hand every workspace's projects to every user. With it, the RLS
-- policies on tracker.projects and tracker.tasks still apply.

create or replace view tracker.project_overview
with (security_invoker = true)
as
select
  p.*,
  coalesce(t.task_total, 0)     as task_total,
  coalesce(t.task_done, 0)      as task_done,
  coalesce(t.task_open, 0)      as task_open,
  coalesce(t.task_overdue, 0)   as task_overdue,
  coalesce(t.task_blocked, 0)   as task_blocked
from tracker.projects p
left join (
  select
    project_id,
    count(*) filter (where status <> 'cancelled')                as task_total,
    count(*) filter (where status = 'done')                      as task_done,
    count(*) filter (where status not in ('done', 'cancelled'))  as task_open,
    count(*) filter (
      where status not in ('done', 'cancelled')
        and due_date is not null
        and due_date < current_date
    )                                                            as task_overdue,
    count(*) filter (where status = 'blocked')                   as task_blocked
  from tracker.tasks
  where deleted_at is null
  group by project_id
) t on t.project_id = p.id;

grant select on tracker.project_overview to anon, authenticated, service_role;
