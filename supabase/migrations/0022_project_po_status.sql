-- 0022_project_po_status.sql
-- Whether a quotation turned into a real job: the customer's PO. A separate
-- axis from `status`, which is about the work (planning/active/completed),
-- not the sale — a quotation can be "planning" while still waiting for the
-- customer to commit, and that's exactly what this makes visible.
--
--   waiting   quoted, no PO from the customer yet (the default)
--   received  customer PO in hand — a real project
--   lost      the customer went elsewhere / the job won't happen

alter table tracker.projects
  add column if not exists po_status text not null default 'waiting'
    check (po_status in ('waiting', 'received', 'lost')),
  add column if not exists po_number text,
  add column if not exists po_date date;

-- Starting values from the only signal already in the data: work actually
-- underway or finished implies a PO; a cancelled quotation is a lost one.
-- Everything else stays "waiting" for the owner to confirm. The touch
-- trigger is paused so this one-off fill doesn't bump updated_at on every
-- row and reshuffle the "Recently updated" list.
alter table tracker.projects disable trigger projects_touch;
update tracker.projects set po_status = 'received' where status in ('active', 'completed');
update tracker.projects set po_status = 'lost' where status = 'cancelled';
alter table tracker.projects enable trigger projects_touch;

-- Same gotcha as 0016/0020: project_overview's `select p.*` is frozen into
-- an explicit column list at CREATE VIEW time, so the new columns are
-- invisible through getProject()/listProjects() until the view is rebuilt.
-- Definition copied unchanged from 0020.

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
