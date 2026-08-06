# AI Project Tracker

Senior-architect brief for this repo, kept alongside the phase-by-phase
detail in `TASKS.md`.

**Goal.** Manage projects end to end — creation through close-out — for one
user today, with the data model already shaped for more users later without a
rewrite. Clean, scalable, secure, responsive.

**Stack.** Next.js 16 (App Router, `--webpack`) · Node · Postgres (Supabase,
own dedicated project, `tracker` schema) · Tailwind v4 · Anthropic Claude API
for summaries · Supabase Auth (real accounts, restored 2026-08-05 — see
"Authentication" below) · local git, no GitHub remote yet.

**Core modules.** Dashboard (KPIs, charts, upcoming/overdue) · project and
task management (kanban, milestones, server-derived progress/health) ·
budgets (planned vs. actual) · file uploads (private bucket, signed URLs) ·
AI summaries (status/risk/standup/report-intro, cached by input hash) · Word
report generation (`docx`, generated from code).

**Coding rules** are the "How to work here" section directly below: explain
architecture before coding, build one `TASKS.md` phase at a time, ask when
unclear, clean code with comments that explain *why*.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## How to work here

- **Explain the architecture before writing code.** A short paragraph on what
  you're about to build and why, then the code. Not the other way round.
- **Build iteratively.** One phase from `TASKS.md` at a time. Finish it, verify
  it in the browser, update `TASKS.md`, then start the next. Do not start
  phase N+1 while phase N is unverified.
- **Ask when unclear.** If two readings of a requirement produce materially
  different code, ask. Don't guess and don't silently pick.
- **Clean code.** Small functions with one job. Names that say what they hold.
  Comments explain *why*, never *what*. Delete dead code rather than commenting
  it out. Match the surrounding style — this repo has one.
- Don't add a dependency for something a dozen lines of TypeScript would do.

## AI Project Tracker specifics

- Root `proxy.ts` gates every route (Next 16 reads `proxy.ts`, exports
  `proxy()` + `config.matcher`, not `middleware.ts`). It delegates to
  `lib/supabase/middleware.ts`'s `updateSession()`, which redirects
  unauthenticated requests to `/login` — except `PUBLIC_PATHS`
  (`/login`, `/register`, `/demo`) and `AUTH_ROUTES` (`/auth/*`, so signing out
  while signed in doesn't redirect back).
- Always build/dev with `--webpack` (scripts already do this); Turbopack is not used.
- Dev server: port 3006 (`dev-server.cmd` or the root `.claude/launch.json`).
  3000–3005 belong to sibling apps.
- **The database lives in the `tracker` schema**, not `public`. Unlike the
  sibling apps (daily-budget-app, project-list-app, visa-flow, tour-booking-app,
  visa-agency, bakery-pos), this app has its **own dedicated Supabase project**
  — the schema name just follows the same convention, there is no actual
  sharing or cross-app blast radius. Both server and browser clients pass
  `db: { schema: "tracker" }`; use `createAuthClient()` for auth and storage
  calls.
- DB migrations: `supabase/migrations/*.sql`, applied with
  `npm run migrate -- --all` (reads `SUPABASE_DB_URL` from `.env.local`) via
  the Supabase pooler. `0008_expose_schema.sql` **APPENDS** to
  `pgrst.db_schemas` rather than overwriting it — harmless on a dedicated
  project, but keep the append-only pattern so it stays safe if this project
  ever hosts more than one schema.
- **`tracker.project_overview` uses `select p.*` and does NOT auto-update
  when `tracker.projects` gains a column.** Postgres expands `p.*` into an
  explicit column list at `CREATE VIEW` time; a later `ALTER TABLE ... ADD
  COLUMN` is invisible to the view until it's explicitly redefined. This bit
  us for real: `location` (0015) was silently unreadable through
  `getProject()`/`listProjects()` — writable, but always `undefined` on
  read — until 0016 fixed it. **Adding a column to `projects` means a
  follow-up migration that drops and recreates `project_overview`** (`CREATE
  OR REPLACE VIEW` only appends at the very end, so if the new column isn't
  the last one on the table, replace won't work — drop and recreate, see
  0016 for the pattern).

## Architecture rules

- **A screen never talks to the database directly.** `app/**/page.tsx` calls
  `lib/db/*`, which calls Supabase. Every query stays in one searchable place.
- **Mutations are server actions** colocated as `app/(app)/<module>/actions.ts`.
  The shape is always: zod `safeParse` → `requireRole()` → mutate →
  `logActivity()` → `revalidatePath()` → return `ActionResult`.
- **Validate every input with zod on the server.** The browser is never trusted.
- **Never trust browser-sent money or progress.** `planned_amount` totals,
  `progress_pct` and `health` are recomputed server-side from source rows.
- **Nothing is hard deleted.** `projects` and `tasks` use `deleted_at`.
- Money is `numeric(14,2)` plus an explicit `currency` column. Never a float.

## Authentication

Real Supabase Auth, restored 2026-08-05 (`0013_restore_auth.sql`, reversing
the earlier `0012_open_access.sql` open-access experiment). Sign-up
auto-provisions a workspace via `0007_signup.sql`'s trigger; sign-in is a
normal email/password flow through `@supabase/ssr`.

- **`createClient()`/`createAuthClient()` in `lib/supabase/server.ts` run as
  the signed-in user** (cookie-based session, anon key) — RLS in
  `0006_rls.sql` is the real security boundary, not application code.
  `requireRole()` is a courtesy that returns a clean error message before RLS
  would reject the write with a less friendly one.
- `SUPABASE_SERVICE_ROLE_KEY` is no longer needed by the running app. It's
  still useful for one-off admin scripts (e.g. `supabase.auth.admin.*` to
  create/delete test users without email confirmation) but must never be
  imported by anything under `app/` or `lib/` that a request path touches.
- **Workspace isolation is real and enforced by RLS**, not just documented —
  verified 2026-08-05 with two separate accounts: a project created by one is
  invisible to the other (`0 projects` reading it back).
- `workspace_id` + `workspace_members` were kept in every schema from day one
  as the multi-user seam; restoring auth activated it rather than needing a
  migration.
- **Adding people to a workspace is by email invite, not self-serve
  multi-workspace membership.** `tracker.workspace_invites` (0017) holds
  pending invites; `provision_workspace()` checks it before making a brand
  new workspace for a signup, so a matching email lands the new account
  straight into the inviter's workspace at the invited role instead of an
  empty one of its own. This only works for people who haven't registered
  yet — `getSessionUser()` in `lib/auth.ts` picks a single membership row
  (oldest first), so there is no workspace switcher and no supported way for
  an already-registered account to join a second workspace. Build one before
  claiming that case works.

## AI rules

- `ANTHROPIC_API_KEY` is **server-only**. Never prefix it `NEXT_PUBLIC_`, never
  import `lib/ai/*` into a client component.
- **AI is read-only.** It receives a project snapshot and returns text. No tool
  use, no autonomous mutation — that keeps `activity_logs` an honest record of
  who changed what.
- Summaries are cached in `ai_summaries` keyed by `input_hash`. An unchanged
  project must not re-bill the API.
- Load the `claude-api` skill before touching `lib/ai/*`.

## Charts

`--chart-1` / `--chart-2` in `globals.css` were validated for colour-vision
deficiency and 3:1 contrast. Do not add or substitute hues by eye — load the
`dataviz` skill and derive a proper categorical set if you need more than two.

## Windows gotcha

Do NOT round-trip source files through PowerShell `Get-Content -Raw` /
`Set-Content`. In Windows PowerShell 5.1 that reads UTF-8 as ANSI and writes
back a BOM, which mangles every non-ASCII character in the file and can break
`package.json` for webpack. Use the Edit/Write tools, or Node.
