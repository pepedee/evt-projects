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
task management (kanban, milestones, timeline, schedule import,
server-derived progress/health) · budgets (planned vs. actual) · payment
tracking (instalments pending → invoiced → paid, dashboard "Payments due") · file
uploads (private bucket, signed URLs) · AI summaries
(status/risk/standup/report-intro, cached by input hash) · Word report
generation (`docx`, generated from code).

**Removed from the app, tables kept (phase 45).** Materials/procurement and
the QC inspection grid were taken out of the UI at the owner's request. Their
tables (`materials`, `qc_items`, `qc_units`, `qc_results`, 0018) and data are
still in the database — one project (EVT26QT002R1) holds 665 real QC results
— so nothing was dropped. To restore the feature, revert the phase-45 commit;
don't write a migration that drops these tables without asking the owner.

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
  (`/login`, `/register`, `/demo`) and `AUTH_ROUTES` (`/auth/*` and
  `/accept-invite`, exempt from redirects in *both* directions: signing out
  while signed in must not redirect back, and an invite link must stay
  reachable whether or not a session exists yet — see "Adding people" below).
- Always build/dev with `--webpack` (scripts already do this); Turbopack is not used.
- Dev server: port 3006 (`dev-server.cmd` or the root `.claude/launch.json`).
  3000–3005 belong to sibling apps.
- **`npm run dev` can point at a fully local Supabase stack instead of the
  cloud project**, added specifically because the cloud project is on the
  free tier and auto-pauses after ~7 days idle (see the guard note below) —
  useful for developing without depending on that project being awake at
  all, and for experimenting without any risk to real business data. Needs
  Docker Desktop running (the local stack is Postgres + Auth + Storage in
  containers, via the `supabase` CLI already in devDependencies).
  `supabase/config.toml` already points at the existing
  `supabase/migrations/*.sql` and exposes the `tracker` schema (not just
  `public`) and uses port 3006 for auth redirects, matching this app. To use
  it: `npm run db:start` (first run pulls images, can take a few minutes; it
  prints a URL, anon key, service-role key, and DB URL when ready), copy
  those into a new `.env.development.local` (template: `.env.development.
  local.example`) using the same variable names as `.env.local` — Next.js
  automatically prefers `.env.development.local` over `.env.local` for `npm
  run dev` and only for `npm run dev`, so `npm run build`/`start` and the
  deployed Vercel site are completely unaffected either way. A fresh local
  database starts empty; sign up through `/register` the normal way to get a
  real local workspace via the same trigger the cloud project uses
  (0007_signup.sql) — no seed data needed. `npm run db:stop` when done,
  `npm run db:reset` to wipe and re-run every migration from scratch. Delete
  or rename `.env.development.local` to go back to the cloud database.
  **Not yet verified end-to-end** (this environment has no Docker) — the
  config is correct by inspection and the migrations are believed compatible
  with a stock local stack, but actually running `db:start` + `db:reset` for
  the first time is the real test; if something in the existing migrations
  turns out to assume something cloud-specific, that's where it will surface.
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
- **File uploads go straight from the browser to Supabase Storage, never
  through a Vercel function.** `components/files/upload-button.tsx` calls
  `storage.upload()` with the browser Supabase client, then `recordDocument`
  (a server action) to log the metadata — there is no `/api/upload` route.
  There used to be one, proxying the file bytes server-side "so validation
  happens in one place"; it silently broke every upload between ~4.5 MB and
  this app's own 20 MB limit with a 413, because Vercel's Node.js Serverless
  Functions cap a request body at 4.5 MB regardless of what the app's own
  `MAX_UPLOAD_BYTES` or the bucket's `file_size_limit` say — a platform
  ceiling, not configurable away, and invisible on `npm run dev` since
  localhost has no such limit. Storage RLS (0011_storage.sql) reads workspace
  membership out of the object path the same way regardless of whether the
  request comes from the browser or a server, so proxying through the server
  was never actually buying any security — don't reintroduce it.
- **`vercel.json` pins serverless functions to `syd1` (Sydney) — do not
  remove it.** The database (`SUPABASE_DB_URL`'s pooler hostname) has always
  lived in `ap-southeast-2`; without this file Vercel defaults functions to
  `iad1` (US East). Since almost every route here is server-rendered against
  the database, that mismatch meant every page load paid a Virginia↔Sydney
  round trip on top of the visitor's own — measured live at ~2.2s average
  for the dashboard before this file existed, ~0.5s after. Invisible on
  `npm run dev`, since localhost has no region to mismatch. If the Supabase
  project ever moves region, update `regions` here to match — check
  `x-vercel-id` on a real request (`sin1::syd1::...`, second segment is
  where the function actually ran) to confirm, don't assume from the config
  alone.
- **A responsive grid always needs an explicit base `grid-cols-N`, not just
  the breakpoint variants.** `className="grid gap-4 sm:grid-cols-2"` looks
  right but below `sm` there's no `grid-template-columns` at all — the
  browser falls back to an implicit track sized by content (`auto`), which
  can grow past the container instead of being capped the way an explicit
  `grid-cols-1` (`minmax(0,1fr)`) would. Bit us for real on the Projects
  card grid: the grid container measured correctly at 343px, but the card
  inside it rendered at 444px, clipping content off the right edge of the
  screen on a phone. Every `grid ... sm:grid-cols-N` / `md:grid-cols-N` /
  `lg:grid-cols-N` in this app now starts with `grid-cols-1` — keep that
  pattern for any new one.
- **The Supabase project (`wvradsepbjtikfabigcm`) is on the free tier and
  auto-pauses after roughly a week of inactivity.** It has now happened
  twice — once when the owner tried to sign in and got a plain "Failed to
  fetch", again ~24 days later, caught while testing something unrelated.
  Paused looks identical to deleted from outside: the domain stops
  resolving in DNS entirely (`DNS_PROBE_FINISHED_NXDOMAIN` / curl exit 6,
  "Non-existent domain"), not a normal HTTP error — check DNS resolution
  for that exact hostname first if *anything* Supabase-related suddenly
  fails, before assuming app code broke. The fix each time was the owner
  clicking "Restore project" on the Supabase dashboard (a few minutes,
  nothing lost) — this environment cannot do it, since it needs their
  account login. Given the recurrence, the owner should either upgrade to
  Supabase Pro (removes auto-pause) or set up a free scheduled ping (e.g.
  cron-job.org hitting `/auth/v1/health` every few days) so this stops
  costing a debugging cycle each time the app goes quiet for a week.
- **`/demo` is intentionally `force-dynamic`, not statically prerendered —
  do not remove that export.** `fixtures.ts` computes several dates as an
  offset from `new Date()` at module-evaluation time; a *static* page bakes
  that into the HTML once at build time while the client bundle
  re-evaluates the same module fresh during hydration, so any real time
  elapsed between build and a visit made the two disagree — a genuine,
  reproducible React hydration error (#418) on every load in production,
  invisible in dev and in a same-day local production build (no time to
  drift yet). Forcing dynamic rendering makes both evaluations happen
  inside the same request, so there's nothing left to disagree about.

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
- **`qc_results` deletes at `member`, not `admin`** (the QC UI is currently
  removed — see "Removed from the app" above — but the policy still applies
  if it returns) — the one table that
  doesn't use `apply_workspace_rls()`'s default. Clearing a QC grid cell back
  to "not yet inspected" is a real row delete (no third enum value for
  blank), but it's routine data entry during inspection, not a destructive
  action like deleting a whole budget line — gating it at `admin` would make
  ordinary QC work require an elevated role for no real reason.

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
- `SUPABASE_SERVICE_ROLE_KEY` mostly isn't needed by the running app, and the
  rule is still: don't import it into anything a request path touches. There
  is exactly **one** deliberate exception — `lib/supabase/admin.ts`, used only
  by `inviteMember` (below) to call `auth.admin.inviteUserByEmail`, which
  genuinely cannot be done any other way. It's also still useful for one-off
  admin scripts (e.g. `supabase.auth.admin.*` to create/delete test users
  without email confirmation). Do not add a second request-path caller
  without a similarly hard requirement — grep for `lib/supabase/admin` to see
  every place it's used.
- **Workspace isolation is enforced by RLS, but RLS alone answers "is this
  user a member of this row's workspace at all", not "is this the workspace
  they're currently working in".** Those were the same question as long as
  everyone had exactly one membership — no longer true since phase 18 added
  multi-workspace membership, and the gap was real, not hypothetical: every
  `lib/db/*` read function shipped through phase 17 relied on RLS alone, and
  the instant a test account belonged to two workspaces, list queries
  (`listProjects`, `getDashboard`, `listMembers`, `listActivity`, etc.)
  silently combined rows from both. **Every one of those functions now takes
  an explicit `workspaceId` and adds `.eq("workspace_id", workspaceId)` —
  RLS is the backstop, the application decides which of a user's permitted
  workspaces a given request means.** Any new `lib/db/*` query must do the
  same; do not assume RLS's `is_member(workspace_id)` is sufficient scoping
  on its own.
- `workspace_id` + `workspace_members` were kept in every schema from day one
  as the multi-user seam; restoring auth activated it rather than needing a
  migration.
- **Which workspace a session resolves to is cookie-driven, not fixed.**
  `getSessionUser()` (`lib/auth.ts`) prefers the membership named by the
  `active_workspace_id` cookie (`ACTIVE_WORKSPACE_COOKIE`) if the user
  actually has a row for it, falling back to their oldest membership
  otherwise — so a tampered or stale cookie just degrades to the default
  rather than granting anything. `switchWorkspace()`
  (`app/(app)/settings/actions.ts`) is the only writer, and re-verifies
  membership before setting it. `Shell` (`components/layout/shell.tsx`)
  only renders the switcher `<Select>` when `listMyWorkspaces()` returns more
  than one workspace — almost nobody ever sees it.
- **Adding people to a workspace is by email invite.** `tracker.workspace_invites`
  (0017) holds pending invites; `provision_workspace()` checks it before
  making a brand new workspace for a signup, so a matching email lands the
  new account straight into the inviter's workspace at the invited role
  instead of an empty one of its own. `inviteMember`
  (`app/(app)/settings/actions.ts`) inserts that row *and* calls
  `auth.admin.inviteUserByEmail`, which creates the `auth.users` row
  immediately (so the trigger honors the invite right away, before the email
  is even opened) and sends Supabase's own invite email. `email_exists` from
  that call means the address is already registered elsewhere — as of
  phase 18 that's handled by resolving their user id
  (`auth.admin.generateLink({ type: "magiclink" })`, which doesn't send
  anything) and inserting them into `workspace_members` directly; the
  now-useless pending-invite row is deleted rather than left to rot, since
  `provision_workspace()` only fires for a brand new signup and would never
  consume it.
- **The invite email's link does not go through `proxy.ts`'s `?code=`
  exchange.** Signup/password-reset links use the PKCE code flow and land as
  a query param the server can read; Supabase's `invite` verify type instead
  redirects with the tokens in the URL **hash**
  (`/accept-invite#access_token=...`), which browsers never send to a server
  at all. `app/(auth)/accept-invite/accept-invite-form.tsx` is a client
  component for exactly this reason — `createAuthClient()`'s
  `detectSessionInUrl` parses the hash and turns it into a session on the
  browser side, then the page prompts for a password
  (`auth.updateUser({ password })`). Confirmed empirically against this
  project with `auth.admin.generateLink` before building against it — don't
  assume the shape of an auth email link, check it.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
