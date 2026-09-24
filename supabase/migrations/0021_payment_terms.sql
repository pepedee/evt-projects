-- 0021_payment_terms.sql
-- Payment tracking: a project's payment terms as individual instalments
-- ("50% prepayment", "50% net 30 days"), each moving pending -> invoiced ->
-- paid. Money the client owes the business — separate from budget_lines /
-- expenses, which are what the job is planned to and did cost.
--
-- Amounts are before VAT, on the same basis as the quotation's own line
-- items (budget_lines). `percent` is informational — the share of contract
-- value this instalment was set up as — `amount` is what's actually tracked.

create table if not exists tracker.payment_terms (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  project_id   uuid not null references tracker.projects(id) on delete cascade,
  label        text not null,
  percent      numeric(5,2) check (percent is null or (percent > 0 and percent <= 100)),
  amount       numeric(14,2) not null default 0 check (amount >= 0),
  due_date     date,
  status       text not null default 'pending'
               check (status in ('pending', 'invoiced', 'paid')),
  invoice_no   text,
  invoiced_on  date,
  paid_on      date,
  sort_order   int not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists payment_terms_project_idx
  on tracker.payment_terms (project_id, sort_order);
-- The dashboard's "payments due" list: unpaid, by due date, per workspace.
create index if not exists payment_terms_due_idx
  on tracker.payment_terms (workspace_id, due_date) where status <> 'paid';

create trigger payment_terms_set_workspace
  before insert or update of project_id on tracker.payment_terms
  for each row execute function tracker.set_workspace_from_project();

create trigger payment_terms_touch before update on tracker.payment_terms
  for each row execute function tracker.touch_updated_at();

-- invoiced_on / paid_on follow status without the application having to
-- remember, same idea as tasks.completed_at (0002). Dates are Bangkok dates,
-- matching lib/format.ts, so a payment marked just after midnight local time
-- doesn't land on yesterday's UTC date. Moving a status back clears the
-- dates it no longer earns; an explicitly entered date is never overwritten.
create or replace function tracker.payment_terms_sync_dates()
returns trigger
language plpgsql
as $$
declare
  today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if new.status = 'invoiced' and new.invoiced_on is null then
    new.invoiced_on := today;
  end if;
  if new.status = 'paid' and new.paid_on is null then
    new.paid_on := today;
  end if;
  if new.status <> 'paid' then
    new.paid_on := null;
  end if;
  if new.status = 'pending' then
    new.invoiced_on := null;
  end if;
  return new;
end;
$$;

create trigger payment_terms_dates
  before insert or update on tracker.payment_terms
  for each row execute function tracker.payment_terms_sync_dates();

select tracker.apply_workspace_rls('payment_terms');
