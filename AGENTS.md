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

- Middleware lives in root `proxy.ts` (exports `proxy()` + `config.matcher`) —
  `middleware.ts` is ignored in Next 16.
- Always build/dev with `--webpack` (scripts already do this); Turbopack is not used.
- Dev server: port 3006 (`dev-server.cmd` or the root `.claude/launch.json`).
  3000–3005 belong to sibling apps.
- **The database lives in the `tracker` schema**, not `public`. The Supabase
  project is shared with daily-budget-app / project-list-app / visa-flow /
  tour-booking-app (`public`), visa-agency (`agency`) and bakery-pos (`bakery`).
  Both server and browser clients pass `db: { schema: "tracker" }`; use
  `createAuthClient()` for auth and storage calls.
- DB migrations: `supabase/migrations/*.sql`, applied with
  `npm run migrate -- --all` (or named files) via the Supabase pooler.
  `0004_expose_schema.sql` **APPENDS** to `pgrst.db_schemas` — never rewrite it
  to assign a fixed list, that would un-expose `agency` and `bakery` and break
  two live apps.

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

## ⚠️ There is no authentication

This app is **open**. There is no sign-in, no sign-up, and no per-person
identity. Everyone who can reach it shares one workspace and has full rights
over everything in it. See `0012_open_access.sql`.

What that means when working here:

- **The server connects with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS.**
  The policies in `0006_rls.sql` still exist but are no longer the gate. The
  only real boundary is who can reach the app.
- **That key must never reach the browser.** Nothing under `lib/db/`, `lib/ai/`
  or `lib/reports/`, and nothing importing `lib/supabase/server.ts`, may be
  imported from a client component. Every read and write goes through a server
  component, a server action, or a route handler. File uploads go through
  `/api/upload` for exactly this reason — the browser cannot hold the key.
- **`requireRole()` and `can()` always succeed.** They are kept at every call
  site deliberately: they document which operations were privileged, so
  restoring authentication means changing `lib/auth.ts` and little else.
- **`export const dynamic = "force-dynamic"` in `app/(app)/layout.tsx` is
  load-bearing.** With no cookies to read, Next would otherwise prerender these
  pages at build time and serve a frozen snapshot of the database.
- **Keep the deployment private.** On a public URL, every project, budget,
  client name and uploaded document is public.

## Multi-user seam (dormant)

Everything is still scoped by `workspace_id`, and `workspace_members` still
exists, so authentication can be restored without a schema rewrite. Today one
fixed workspace is used, defined in `0012_open_access.sql` and mirrored by
`SHARED_WORKSPACE_ID` in `lib/auth.ts` — the two must match.

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
