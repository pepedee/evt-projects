-- 0010_budget_rollup.sql
-- Budget rollups, computed in the database so no total ever depends on a
-- number the browser sent.
--
-- Note the shape of both views: each one-to-many child is aggregated in its
-- own subquery before being joined. Joining tasks, budget_lines and expenses
-- to projects directly would multiply rows against each other and inflate
-- every sum.
--
-- security_invoker = true on both. Without it a view runs as its owner and
-- ignores the RLS policies on the tables underneath.

-- Spent per budget line.
create or replace view tracker.budget_line_overview
with (security_invoker = true)
as
select
  b.*,
  coalesce(e.spent_total, 0)::numeric(14,2) as spent_total,
  coalesce(e.expense_count, 0)              as expense_count
from tracker.budget_lines b
left join (
  select budget_line_id, sum(amount) as spent_total, count(*) as expense_count
  from tracker.expenses
  where budget_line_id is not null
  group by budget_line_id
) e on e.budget_line_id = b.id;

grant select on tracker.budget_line_overview to anon, authenticated, service_role;

-- Rebuilt to carry budget totals alongside the task counts. Dropped and
-- recreated rather than replaced, so the column list is unambiguous.
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
  -- Expenses charged to no budget line: real money that no plan accounted for.
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
