# TASKS — AI Project Tracker

Shared task list. Any tool working in this repo reads this first and updates it
at the end of every phase. Statuses: `todo` / `in-progress` / `done` / `blocked`.

Rule: finish and verify one phase before starting the next.

## Phases

| # | Phase | Scope | Status | Notes |
|---|---|---|---|---|
| 1 | Scaffold | Next 16 + Tailwind v4, `proxy.ts`, both Supabase clients, migration runner, port 3006, docs | **done** | Verified: `/` → `/login` via proxy, build + lint clean, 0 npm vulnerabilities |
| 2 | Database | Migrations 0000–0008: `tracker` schema, workspaces + members, domain tables, RLS helpers + policies, expose_schema (APPEND), signup trigger | **blocked** | SQL is written and committed. Cannot apply: the Supabase project no longer exists (see Blockers). |
| 3 | Auth + shell | Login/register, `lib/auth.ts`, protected `(app)` layout, sidebar, topbar, dark mode | **code complete, unverified** | Build + lint clean. `/login` and `/register` render; `/dashboard` correctly bounces to `/login`. The signed-in half (workspace resolution, sidebar, sign-out) cannot be exercised until the database is back. |
| 4 | Projects + tasks | `lib/db/projects.ts`, `tasks.ts`, list + detail + kanban, milestones, server-derived progress and health | **code complete, unverified** | Build + lint clean, all 13 routes register, guards hold. No query, trigger or RLS policy has ever run. Adds migration `0009_project_overview.sql`. |
| 5 | Budgets | Budget lines, expenses, planned-vs-actual rollups | **code complete, unverified** | Build + lint clean. Adds migration `0010_budget_rollup.sql`. Every total comes from a SQL view, never from the browser. |
| 6 | Files | Private bucket `project-files`, `lib/storage.ts`, upload button, 300s signed URLs | todo | Done when upload/download/delete work and raw URLs 403 |
| 7 | Dashboard | KPI cards, charts, upcoming + overdue, recent activity | todo | Done when the numbers match the underlying tables |
| 8 | AI summaries | `lib/ai/*`, streaming route, caching by `input_hash` | todo | Done when a summary renders and the second call hits cache |
| 9 | Word reports | `lib/reports/word.ts` with `docx`, download route | todo | Done when the `.docx` opens in Word with correct data |
| 10 | Polish | Empty/loading/error states, activity log view, responsive audit, README | todo | Done when `npm run build` and `npm run lint` are clean and it works on a phone |

## Decisions (settled — do not relitigate)

| Decision | Choice | Why |
|---|---|---|
| Auth | **Supabase Auth**, not NextAuth | RLS policies key off `auth.uid()`. NextAuth would issue its own session and push all security into app code. Kept behind `lib/auth.ts` so a swap touches one file. |
| Database | **Shared Supabase project, new `tracker` schema** | Matches visa-agency (`agency`) and bakery-pos (`bakery`). Gets Storage and Auth for free. |
| AI provider | **Anthropic Claude API** (`@anthropic-ai/sdk`) | `claude-sonnet-5` for narrative summaries, `claude-haiku-4-5-20251001` for the frequent risk scan. |
| Word reports | **Generated from code with `docx`** | Full control, no template file to keep in sync. `Unit Report Template (editable).docx` is a layout reference only. |
| Multi-user | **`workspace_id` + `workspace_members` from day one** | Single user today is one workspace with one member. Adding people stays a data change. |
| Next version | **16.3.0**, not the siblings' 16.2.10 | 16.2.10 carries nine high-severity advisories (SSRF in server actions, cache confusion, unauthenticated server-function disclosure). The conventions that matter — `proxy.ts`, `--webpack` — are identical. |

## Blockers

**The shared Supabase project is gone.** `lfpsnhuarpdlzrsnycmo.supabase.co` does
not resolve in DNS (confirmed against 8.8.8.8, not a local resolver problem),
and the session pooler rejects the tenant with `tenant/user not found`. The
second project used by tour-booking-app (`rvxrkucmhmirtioxidvf`) is gone too.

This blocks phases 2–9, and it also means the five sibling apps that point at
that project (daily-budget-app, project-list-app, visa-flow, visa-agency,
bakery-pos) cannot reach their database either.

Needs a decision: restore the project, or stand up a new one and update
`PROJECT_REF` in `scripts/*.mjs` plus `NEXT_PUBLIC_SUPABASE_*` in `.env.local`.
If the new project is dedicated to this app rather than shared, the `tracker`
schema and `0008_expose_schema.sql` can both be dropped in favour of `public`.

### To verify once a database exists

1. `npm run migrate -- --all`, then `node scripts/check-schemas.mjs`.
2. Register an account. Confirm the signup trigger created a workspace and the
   sidebar shows it with role Owner.
3. Sign out from the topbar — confirm it lands on `/login` and does not bounce
   back (`AUTH_ROUTES` in `lib/supabase/middleware.ts` exists for exactly this).
4. Delete the membership row by hand and reload: `ensure_workspace()` should
   silently rebuild it.
5. Sign in as a second account with no membership and confirm every list is
   empty and every write is refused by RLS, not merely hidden in the UI.
6. Phase 4: create a project, add tasks, mark one done — `progress_pct` must
   move on its own (the trigger computes it; the app never writes it). Add an
   overdue task and confirm health flips to at risk, then off track past the
   target date.
7. Confirm `tracker.project_overview` respects RLS. It is declared
   `security_invoker = true`; without that a view hands every workspace's rows
   to every user. Query it as the second account and expect zero rows.
8. Phase 5: add two budget lines and several expenses, then check the totals by
   hand against the rows. The views aggregate each child table in its own
   subquery before joining — if that were ever flattened into direct joins,
   tasks and expenses would multiply against each other and every sum would be
   inflated. A project with both tasks and expenses is the case that catches it.
9. Record an expense with no budget line and confirm it shows as *Unbudgeted*
   and lands in `spent_unassigned`, not silently in a line.
10. Delete a budget line that has expenses charged to it. The expenses must
    survive as unassigned (FK is `on delete set null`), not disappear.
11. Confirm the expense/budget-line project guard fires: charging an expense to
    a line from another project must be refused by the trigger.

## Open items

- Import "won" projects from `project-list-app` into the tracker — revisit after
  phase 4 proves the data model. Not in scope now.
- GitHub remote not created. Repo is local-only (`git init` in phase 1).
