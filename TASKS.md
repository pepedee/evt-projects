# TASKS — AI Project Tracker

Shared task list. Any tool working in this repo reads this first and updates it
at the end of every phase. Statuses: `todo` / `in-progress` / `done` / `blocked`.

Rule: finish and verify one phase before starting the next.

## Phases

| # | Phase | Scope | Status | Notes |
|---|---|---|---|---|
| 1 | Scaffold | Next 16 + Tailwind v4, both Supabase clients, migration runner, port 3006, docs | **done** | Verified at the time: build + lint clean, 0 npm vulnerabilities. `proxy.ts` (removed in `ac6d171`, restored in `0013_restore_auth.sql`'s commit) is back and live-verified — see phase 3. |
| 2 | Database | Migrations 0000–0008: `tracker` schema, workspaces + members, domain tables, RLS helpers + policies, expose_schema (APPEND), signup trigger | **done** | 2026-08-05: all 13 migrations (0000–0012) applied cleanly to the new dedicated project, zero errors. `npm run check-schemas` confirms `tracker` is exposed alongside `public`/`graphql_public`. |
| 3 | Auth + shell | Login/register via Supabase Auth (restored 2026-08-05), `lib/auth.ts`, protected `(app)` layout, sidebar, topbar, dark mode | **verified** | 2026-08-05: full loop confirmed live — created a confirmed account via the Admin API, signed in through the real `/login` form, dashboard showed the real identity ("signed in as Owner"), signed out via the topbar button, `/dashboard` correctly redirected back to `/login`. A second account in its own workspace saw `0 projects` from the first account's workspace — real RLS isolation, not just documented. Also: theme toggle flips the `dark` class, mobile drawer opens/closes with Escape support, skip-to-content is the first tab stop, `/demo` stays reachable without signing in. |
| 4 | Projects + tasks | `lib/db/projects.ts`, `tasks.ts`, list + detail + kanban, milestones, server-derived progress and health | **verified** | 2026-08-05: **the real "New project" form was completely broken until today** — see the `created_by`/`owner_id`/`assignee_id` bug below. Fixed and re-verified: submitting the actual form creates a real row. `progress_pct` trigger, overdue counting, and `project_overview` also confirmed via direct SQL. Kanban drag-and-drop specifically not exercised. |
| 5 | Budgets | Budget lines, expenses, planned-vs-actual rollups | **verified** | 2026-08-05: live checks confirm rollup math (planned 1000 / spent 550 / unassigned 150), the cross-project budget-line guard trigger fires, and deleting a budget line leaves its expenses unassigned rather than deleting them (`on delete set null`). |
| 6 | Files | Private bucket `project-files`, `lib/storage.ts`, upload button, 300s signed URLs | **verified** | 2026-08-05: live checks confirm upload, a working signed URL that returns the correct bytes, the raw/public URL being refused (bucket is private, confirmed 400), and clean deletion. Upload-button UI and viewer-role RLS denial not exercised. |
| 7 | Dashboard | KPI cards, charts, upcoming + overdue, recent activity | **verified** | 2026-08-05: seeded a live project and confirmed dashboard KPI tiles ("Active projects", "Open tasks") match the seeded counts exactly. Chart rendering/theming not re-verified visually this session — see `/demo` for that (step 27, done pre-database). |
| 8 | AI summaries | `lib/ai/*`, streaming route, caching by `input_hash` | **verified** | 2026-08-05: `ANTHROPIC_API_KEY` added. Live-verified all three behaviors: fresh generation (`cached:false`, real factually-grounded text matching the seeded project), replay from cache on an identical re-request (`cached:true`), and regeneration after editing a task (`input_hash` correctly invalidates). Bundle scan re-confirmed clean. Caching was actually broken until the `created_by` fix below — every call was silently regenerating. |
| 9 | Word reports | `lib/reports/word.ts` with `docx`, download route | **verified** | 2026-08-05: `GET /api/reports/word?projectId=...` against a live project returns HTTP 200, correct OOXML content-type, and a valid ZIP-signed (`PK`) .docx — both with `?ai=0` and with no `ANTHROPIC_API_KEY` set at all, confirming AI sections are truly best-effort and never block the download. |
| 10 | Polish | Empty/loading/error states, activity log view, responsive audit, README | **verified** | Build + lint clean. Skip-to-content confirmed as the first tab stop; mobile drawer opens/closes correctly with Escape support; no horizontal overflow at 375 / 768 / 1280 on the live dashboard. `/demo` (fixture-based) verified separately. Not covered: settings/activity-log page interactions, and a full drag-and-drop kanban pass. |
| 11 | Handover report | `documents.category`, `tasks.kind` ('defect'), `projects.location`, AI-drafted handover summary, `lib/reports/handover.ts` with embedded photos + listed documents, download route + UI entry point | **verified** | 2026-08-06: construction-industry completion/handover report (project overview, scope of work, as-built drawings, inspection certificates, defect/snag list, warranties, O&M manuals, financial summary). Photos embed inline via `docx`'s `ImageRun` (jpg/png/gif only — webp and non-images list as unembeddable rather than failing the report); drawings/certificates/warranties/O&M manuals are listed by name. Defects reuse `tasks.kind` rather than a separate table. Shared Word-building helpers extracted to `lib/reports/shared.ts`, used by both this and the original status report. Verified live end-to-end with a throwaway test account: uploaded a real photo through the actual UI (category picker), confirmed the `.docx`'s ZIP contains a real `word/media/*.jpg` entry (not just a non-erroring response), and the AI-drafted handover summary read correctly from the project record while correctly omitting sections it wasn't asked to write. Test account and orphaned storage objects cleaned up after. **`projects.location` was silently unreadable through `project_overview` until 0016** — see phase 12. |
| 12 | Import project from PDF | `lib/ai/import.ts` (forced tool-use extraction), `app/api/projects/import/route.ts`, `components/projects/import-form.tsx` (upload → editable review → save), `createProjectFromImport` action, `0016_project_overview_location.sql` | **verified** | 2026-08-06: upload a quotation PDF, Claude extracts a draft project (name/code/client/location/description/currency/budget lines/tasks) via a forced tool call, user reviews and edits every field before anything is saved — nothing is written until the review form is submitted. PDF only for v1 (Claude's document content block doesn't take .docx/.xlsx directly). Verified live against a real quotation (EVT26QT034): every extracted field matched the source document exactly, including the money figures. **Found and fixed a real bug while verifying**: `tracker.project_overview` was built with `select p.*` before `projects.location` existed (0015); Postgres locks a wildcard's column list at `CREATE VIEW` time and never auto-updates it, so `location` was writable but always read back as `undefined` through `getProject()`/`listProjects()` — the Edit page's pre-fill and the handover report's Location row were both silently blank. Fixed in `0016_project_overview_location.sql` (drop + recreate, since `CREATE OR REPLACE VIEW` can only append columns at the very end and `location` wasn't last). Guard note added to `AGENTS.md` so a future column addition doesn't repeat this. |
| 13 | Task due dates, inline | `setTaskDueDate` action, editable date `<input>` on each row in `TaskList` and `TaskBoard` | **verified** | 2026-08-06: due date could only ever be set at task creation — no way to add or change one on an existing task. Added a dedicated action (same pattern as `setTaskStatus`: partial update, not the full `updateTask` schema) and an inline date input in both the list and kanban views. Verified live: set a date on a task with none, confirmed the exact value persisted in Postgres (`to_char` check, sidestepping a red-herring UTC/local-midnight artifact in my own verification script's JS `Date` handling — the stored value was correct all along), and confirmed the UI's relative-date label ("in 14 days") updated after reload. |
| 14 | Budget line editing | `patchBudgetLine` (partial update, replaces the original `updateBudgetLine` full-row action) wired into `BudgetLines` as inline category/amount inputs | **verified** | 2026-08-06: the action existed since phase 5 but nothing called it — only add and delete were reachable from the UI. Added inline editable inputs, saved on blur. **Found and fixed a real bug live while verifying**: category and amount inputs shared one `pending` flag with the whole list (add form, delete, every row); editing category disabled every other input — including the amount field — for the duration of that save's round trip, so a fast edit-then-edit-the-next-field sequence silently dropped the second edit entirely (confirmed by reproducing it, then fixing, then reproducing the same fast sequence again and confirming both fields saved). Fixed by not disabling these two inputs on the shared `pending` flag — a failed save still surfaces through the existing error `Notice`, so blocking input during a background save was never load-bearing. **Retrofitted after phase 15**: `updateBudgetLine` had the same full-row-resend race that phase 15 found and fixed in expenses (two fields on one row, later stale-snapshot save silently overwriting an earlier concurrent edit). Replaced with `patchBudgetLine`, a true partial update, same shape as `patchExpense`. Verified live with a fresh throwaway account: typed a new category, then — before that save's round trip landed — immediately triple-clicked and retyped the amount field; after both blurred, a hard page reload confirmed both the new category ("Materials") and new amount (2,500) persisted correctly with neither stomping the other. |
| 15 | Expense editing | `patchExpense` (new, true partial update — no `updateExpense` existed before this), inline description/budget-line/date/amount editing in `ExpenseList` | **verified** | 2026-08-06: expenses only ever supported add and delete; there was no update action of any kind. Added inline editing for all four fields. **Found and fixed a second, more subtle version of phase 14's race** while verifying: the first implementation avoided the shared-`pending`-disables-everything bug by not disabling inputs, but still resent the *whole row* (reconstructed from the component's `expense` prop) on every single field's save. With four independently-editable fields on one row, editing two different fields within the same fraction of a second — realistic: type an amount, then click a different field before the first save's server round trip and revalidation complete — let the second save's stale snapshot silently overwrite the first field's just-saved value, even though neither save touched the other's field directly. Reproduced it live (amount edit lost after a concurrent budget-line change), then fixed it properly: `patchExpense` only `UPDATE`s the columns actually passed, so two concurrent single-field saves can never stomp each other regardless of ordering. Reproduced the identical fast sequence again afterward and confirmed both fields now save correctly. Worth remembering for any future multi-field-per-row inline editing in this app: **partial-field updates, not whole-row resends, or this exact bug returns.** |

## Decisions (settled — do not relitigate)

| Decision | Choice | Why |
|---|---|---|
| Auth | ~~Open access~~ → **Supabase Auth, restored** (reversed again 2026-08-05, before deploying) | Real email/password sign-in; RLS in `0006_rls.sql` is the actual gate again, not just documented. `0013_restore_auth.sql` reverses `0012_open_access.sql`. Prompted directly by "deploy it" — open access was fine on localhost but would have made every project, budget, and file public on a real URL. See AGENTS.md's Authentication section. |
| Database | **Dedicated Supabase project, `tracker` schema** (changed 2026-08-05) | Originally a shared project (matching visa-agency's `agency`, bakery-pos's `bakery`). Reversed after the shared project died in DNS and took five sibling apps down with it — this app now owns its project outright, so no other app's outage or config can affect it. Schema name kept for convention, not because it's shared. |
| AI provider | **Anthropic Claude API** (`@anthropic-ai/sdk`) | Model defaults to `claude-opus-5`, overridable with `ANTHROPIC_MODEL`. Cost is controlled with `effort` (`medium` for narrative kinds, `high` for the risk scan) rather than by silently picking a smaller model. |
| Word reports | **Generated from code with `docx`** | Full control, no template file to keep in sync. `Unit Report Template (editable).docx` is a layout reference only. |
| Multi-user | **`workspace_id` + `workspace_members` from day one** | Single user today is one workspace with one member. Adding people stays a data change. |
| Next version | **16.3.0**, not the siblings' 16.2.10 | 16.2.10 carries nine high-severity advisories (SSRF in server actions, cache confusion, unauthenticated server-function disclosure). The conventions that matter — `proxy.ts`, `--webpack` — are identical. |

## Fixed: `created_by`/`owner_id`/`assignee_id`/`actor_id` foreign-key bug (2026-08-05)

**Found by actually using the app**, not by reading code: submitting the real
"New project" form threw `insert or update on table "projects" violates
foreign key constraint "projects_owner_id_fkey"` right on screen. Direct-SQL
verification (used for phases 4–7 earlier the same day) never exercises the
app's own server actions, so it missed this entirely — a reminder that SQL
checks and clicking the real UI catch different bugs.

**Root cause:** `0012_open_access.sql` made `workspaces.created_by` nullable
when it removed authentication, but missed every other column with the same
`references auth.users(id)` foreign key: `projects.owner_id`,
`projects.created_by`, `tasks.created_by`, `tasks.assignee_id`,
`ai_summaries.created_by`, `report_jobs.created_by`, `activity_logs.actor_id`.
The anonymous session's fixed id (`lib/auth.ts`'s `ANONYMOUS.id`) has never
existed in `auth.users`, so every write into one of those columns violated
its foreign key.

**Blast radius:** project creation failed outright (thrown, user-facing).
Task creation had the identical pattern. AI summary caching and the activity
log both *appeared* to work — the AI panel still streamed real answers, the
UI showed no error — because both call sites swallow the insert error rather
than surfacing it, so the failure was invisible: summaries silently never
cached (re-billing the API on every view) and the activity log stayed
permanently empty.

**Fix (anonymous era):** every affected insert wrote `null` for these columns
instead of `user.id` — the columns are already nullable for exactly this
reason. Touched `lib/audit.ts`, `lib/ai/summarize.ts` (+ removed the then-dead
`userId` param from `saveSummary`/`generateSummary` and their call sites),
`app/(app)/projects/actions.ts`, `app/(app)/tasks/actions.ts`,
`app/(app)/budgets/actions.ts`, `app/api/reports/word/route.ts`. Re-verified
live at the time: project creation, task creation, AI summary caching
(generate → cache-hit → invalidate-on-edit), and the activity log all
confirmed working through the actual app, not just SQL.

**Superseded same day, once auth was restored:** all six `null` writes above
were reverted back to `user.id`/`input.userId` — with real `auth.users` rows
now backing every session, the original code was correct all along and the
`userId` params came back too. Re-verified live again: `owner_id`/
`created_by`/`actor_id` on a freshly created project all show the real
signed-in user's UUID, not `null`.

## Blockers

**Resolved 2026-08-05.** The dedicated Supabase project is live, all migrations
are applied, and the schema is exposed. Remaining work is walking the
verification checklist below, phase by phase.

<details>
<summary>History (kept for context)</summary>

**Previously: waiting on a live Supabase project.** The old shared project
(`lfpsnhuarpdlzrsnycmo.supabase.co`) stopped resolving in DNS on 2026-08-04
(confirmed against 8.8.8.8, not a local resolver problem) and the session
pooler rejects the tenant with `tenant/user not found`. It was shared with
five sibling apps (daily-budget-app, project-list-app, visa-flow, visa-agency,
bakery-pos), all of which went down with it.

**Decision made 2026-08-05: this app gets its own dedicated Supabase project**,
not a shared one — see the Database row above. `scripts/apply-migration.mjs`
and `scripts/check-schemas.mjs` no longer hardcode a project ref or read a
password file from a sibling app's directory; both now read a single
`SUPABASE_DB_URL` from `.env.local` (see `.env.local.example`).

**Still needed:** the project itself. Create one at the Supabase dashboard (or
provide a Personal Access Token so it can be created via the Management API),
then fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` in `.env.local`. Once
that's done: `npm run migrate -- --all`, then `npm run check-schemas`.

</details>

### To verify against the live database

1. `npm run migrate -- --all`, then `npm run check-schemas` — confirms the
   `tracker` schema is exposed to PostgREST.
2. Register an account. Confirm the signup trigger (`0007_signup.sql`,
   reactivated by `0013_restore_auth.sql`) created a workspace and the sidebar
   shows it with role Owner. **Verified 2026-08-05** via the Admin API +
   real `/login` form (email confirmation bypassed for testing with
   `email_confirm: true`, since there's no inbox to check here) — the trigger
   correctly provisioned `"<name>'s workspace"` with Owner role.
3. Sign out from the topbar — confirm it lands on `/login` and does not bounce
   back (`AUTH_ROUTES` in `lib/supabase/middleware.ts` exists for exactly
   this). **Verified 2026-08-05.**
4. Delete the membership row by hand and reload — `ensure_workspace()` should
   repair it rather than showing an empty screen. Not yet re-verified since
   auth was restored.
5. Sign in as a second account and confirm RLS refuses it. **Verified
   2026-08-05**: a second account, in its own separate workspace, read back
   `0 projects` for a project that genuinely existed under the first
   account's workspace — real isolation, not just a documented intent. Also
   confirm `SUPABASE_SERVICE_ROLE_KEY` never reaches the browser bundle (it's
   no longer even read by the running app, only by admin scripts) —
   `Get-ChildItem .next\static -Recurse -Include *.js | Select-String "service_role","SUPABASE_SERVICE_ROLE_KEY"`
   must find nothing.
6. Phase 4: create a project, add tasks, mark one done — `progress_pct` must
   move on its own (the trigger computes it; the app never writes it). Add an
   overdue task and confirm health flips to at risk, then off track past the
   target date.
7. Confirm `tracker.project_overview` is declared `security_invoker = true` in
   the migration — without it, the view would run as its owner and bypass RLS,
   handing every workspace's rows to every signed-in user regardless of
   membership. Directly relevant now that multi-user auth is live; step 5's
   isolation test above already covers the practical case.
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
12. Phase 6: upload a file, then fetch its raw storage URL while signed out —
    it must 403. A public bucket here would expose every customer document.
13. Force the metadata insert to fail (temporarily break `recordDocument`) and
    confirm the uploaded object is removed again. An orphaned blob is invisible
    in the UI and can only be found from the Supabase dashboard.
14. Upload the same filename to the same project twice. The second must become
    v2 with `replaces_id` pointing at v1, not restart at v1 — the NULL-safe
    branch in the version lookup is what makes workspace-level files work.
15. Delete a file and confirm both the row and the object are gone.
16. Upload as a viewer: the storage RLS policy must refuse it, not just the UI.
    Also try a file over 20 MB and a disallowed type — the bucket enforces both
    independently of `validateFile()`.
17. Phase 7: check the dashboard totals against the tables by hand. `getDashboard`
    counts open and overdue tasks by summing `project_overview` across live
    projects — that is only right if the view's per-project counts are right,
    so step 8 has to pass first.
18. Put one project over budget and eyeball the meter in both themes. Over
    budget the track changes meaning: it becomes total spend, split into
    planned and overspend. Confirm 130% and 400% look clearly different from
    each other.
19. Give a project a very long name and confirm it truncates rather than
    colliding with the value on the right.
20. Phase 8: set `ANTHROPIC_API_KEY`, open a project, run each summary kind.
    Confirm the "Thinking…" state appears and is replaced by streaming text.
21. Run the same summary twice without changing the project — the second must
    come back instantly marked *Cached*. Then edit one task and re-run: it must
    regenerate, proving the hash tracks the snapshot.
22. Confirm a summary never states a fact absent from the project. The prompt
    forbids it, but this is the failure mode that matters most in a tracker.
23. Re-run the bundle scan after any change to `lib/ai/`:
    `Get-ChildItem .next\static -Recurse -Include *.js | Select-String "ANTHROPIC_API_KEY","sk-ant-"`
    must find nothing.
24. Phase 9: `npm run report:preview` after any change to `lib/reports/word.ts`,
    and open the result. The fixture covers the awkward cases — overdue task,
    over-budget line, unbudgeted spend — and the validator only checks that the
    file is well-formed, not that it *looks* right.
25. Download a report from a real project and confirm the figures match the
    screen. Check a project with no milestones and no budget renders those
    sections as "not recorded" rather than as empty tables.
26. Confirm `?ai=0` produces a report with no executive summary or risks
    section, and that a project downloads successfully when
    `ANTHROPIC_API_KEY` is unset — the AI sections are best-effort and must
    never be the reason a download fails.
27. Phase 10: `/demo` renders the real components from fixture data with no
    database, so the dashboard, project detail, budget table and kanban can all
    be reviewed at 375 / 768 / 1280 without signing in. **This already caught a
    real bug** — `Card` had no `min-w-0`, so as a grid child it refused to
    shrink and the dashboard scrolled sideways at 375px. Re-check `/demo` after
    any layout change. The remaining gap is the signed-in shell (sidebar,
    drawer, topbar), which the demo does not exercise. Re-run it on the
    dashboard, project detail, the kanban board and the budget tables at
    375 / 768 / 1280, in both themes. The tables are the likely offenders:
    each sits in an `overflow-x-auto` wrapper, so the table should scroll on
    its own without the page body scrolling sideways.
28. Keyboard pass: tab from the top of an `(app)` page. "Skip to content"
    should appear first and jump past the sidebar. On a narrow viewport, open
    the drawer and confirm Escape closes it.
29. Confirm the loading skeletons actually appear. They only show while a route
    segment streams, so a fast local database may skip them entirely — throttle
    the network to see them.

## Deployed (2026-08-05)

Live at **https://ai-project-tracker-zeta.vercel.app** (Vercel project
`bozosx-debugs-projects/ai-project-tracker`). `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `ANTHROPIC_API_KEY` are set as Production
env vars in Vercel — `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_DB_URL` deliberately
are not, since the deployed app never reads them. Verified live:
unauthenticated `/dashboard` redirects to `/login`; `/demo` stays reachable
without signing in.

**Fixed 2026-08-05: email confirmation links were completely non-functional,
not just pointed at the wrong domain.** The owner reported clicking a
confirmation link and landing on `localhost:3000/?code=...`. Two separate
bugs, both now fixed/flagged:

1. **Missing code exchange (real bug, now fixed).** Nothing in the app ever
   turned that `?code=` into a session — there was no callback route at all.
   `app/page.tsx` just did `redirect("/dashboard")`, silently dropping the
   code, and `proxy.ts` would have bounced the (still-signed-out) request to
   `/login` before the page even ran. Fixed in `lib/supabase/middleware.ts`:
   `updateSession()` now checks for a `code` query param on every request and
   calls `exchangeCodeForSession()` before any redirect logic runs — a Server
   Component can't set cookies itself, so the middleware is the only place
   that can turn the code into a signed-in session cookie. Verified: an
   invalid/expired code cleanly redirects to `/login` rather than crashing;
   the success path follows Supabase's own documented pattern for this exact
   scenario. Full round-trip with a real code couldn't be tested here — it
   requires the *same browser* that submitted the sign-up form (the PKCE
   `code_verifier` lives in a cookie only that browser has), and there's no
   real inbox to click a link from in this environment.
   **Known limitation worth being aware of:** if a user signs up on one
   device/browser and opens the confirmation email on another, this exchange
   will fail (`code_verifier` won't match) — that's inherent to PKCE + email,
   not something this fix can close. Supabase's recommended fix is switching
   the email template to a `token_hash`-based `/auth/confirm` route instead
   of the default `?code=` link, which needs a dashboard template edit (see
   below) — not done, since it's a bigger change than "fix the redirect."
2. **Site URL still needs manual action on the Supabase dashboard** —
   Authentication → URL Configuration → set Site URL (and add a Redirect URL)
   to `https://ai-project-tracker-zeta.vercel.app`. Not doable from here.

## Open items

- Import "won" projects from `project-list-app` into the tracker — revisit after
  phase 4 proves the data model. Not in scope now.
- GitHub remote not created. Repo is local-only (`git init` in phase 1). Vercel
  deploys were pushed straight from the local directory via `vercel --prod`,
  which works but means there's no CI and no PR-preview workflow.
