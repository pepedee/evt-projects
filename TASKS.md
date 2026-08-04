# TASKS — AI Project Tracker

Shared task list. Any tool working in this repo reads this first and updates it
at the end of every phase. Statuses: `todo` / `in-progress` / `done` / `blocked`.

Rule: finish and verify one phase before starting the next.

## Phases

| # | Phase | Scope | Status | Notes |
|---|---|---|---|---|
| 1 | Scaffold | Next 16 + Tailwind v4, `proxy.ts`, both Supabase clients, migration runner, port 3006, docs | **done** | Verified: `/` → `/login` via proxy, build + lint clean, 0 npm vulnerabilities |
| 2 | Database | Migrations 0000–0005: `tracker` schema, workspaces + members, domain tables, RLS helpers + policies, expose_schema (APPEND), signup trigger | in-progress | Done when `npm run migrate -- --all` is clean **and** visa-agency (3003) + bakery-pos (3005) still load |
| 3 | Auth + shell | Login/register, `lib/auth.ts`, protected `(app)` layout, sidebar, topbar, dark mode | todo | Done when signup auto-creates a workspace and lands on the dashboard |
| 4 | Projects + tasks | `lib/db/projects.ts`, `tasks.ts`, list + detail + kanban, milestones, server-derived progress and health | todo | Done when CRUD works and a second account with no membership sees nothing |
| 5 | Budgets | Budget lines, expenses, planned-vs-actual rollups | todo | Done when variance is correct on project detail |
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

## Open items

- Import "won" projects from `project-list-app` into the tracker — revisit after
  phase 4 proves the data model. Not in scope now.
- GitHub remote not created. Repo is local-only (`git init` in phase 1).
