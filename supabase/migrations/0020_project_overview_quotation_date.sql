-- 0020_project_overview_quotation_date.sql
-- Same gotcha as 0016: tracker.project_overview's `select p.*` is expanded
-- into an explicit column list at CREATE VIEW time and does not pick up
-- quotation_date (added in 0019) on its own. Dropped and recreated so the
-- view actually exposes it — otherwise it would be writable but silently
-- unreadable through getProject()/listProjects(), exactly like location was.
--
-- Full view definition, copied from 0016_project_overview_location.sql
-- unchanged (still `select p.*`, which Postgres re-expands at CREATE time
-- to whatever tracker.projects' columns are now).

drop view if exists tracker.project_overview;

create view tracker.project_overview
with (security_invoker = true)
as
select
  p.*,
  coalesce(t.task_total, 0)          as task_total,
  coalesce(t.task_done, 0)           as task_done,
  coalesce(t.task_open, 0)           as task_open,
  coalesce(t.task_overdue, 0)        as task_overdue,
  coalesce(t.task_blocked, 0)        as task_blocked,
  coalesce(b.planned_total, 0)::numeric(14,2)     as planned_total,
  coalesce(x.spent_total, 0)::numeric(14,2)       as spent_total,
  coalesce(x.spent_unassigned, 0)::numeric(14,2)  as spent_unassigned
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
) t on t.project_id = p.id
left join (
  select project_id, sum(planned_amount) as planned_total
  from tracker.budget_lines
  group by project_id
) b on b.project_id = p.id
left join (
  select
    project_id,
    sum(amount)                                          as spent_total,
    sum(amount) filter (where budget_line_id is null)     as spent_unassigned
  from tracker.expenses
  group by project_id
) x on x.project_id = p.id;

grant select on tracker.project_overview to anon, authenticated, service_role;
