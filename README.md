# AI Project Tracker

Track projects end to end — tasks, milestones, budgets, files — with AI-written
status summaries and generated Word reports.

## Stack

Next.js 16 (App Router, React 19, TypeScript) · Tailwind CSS v4 · Supabase Auth
· dedicated Supabase Postgres project (`tracker` schema) · Supabase Storage ·
zod · Anthropic Claude API · `docx` · Vercel.

## Getting started

```bash
npm install
```

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | This app's own dedicated Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Used by both the browser and server clients; RLS is the real gate |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Not read by the running app; only useful for one-off admin scripts |
| `SUPABASE_DB_URL` | yes (for scripts) | Postgres connection string used only by `scripts/*.mjs`, not by the app itself |
| `ANTHROPIC_API_KEY` | no | Without it, AI summaries are hidden and reports are generated without their prose sections |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5` |

Apply the database migrations, then confirm the app's own schema is exposed:

```bash
npm run migrate -- --all
```

```bash
npm run check-schemas
```

Run the dev server (port 3006):

```bash
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3006 |
| `npm run build` / `npm run lint` | Must both be clean before a phase is done |
| `npm run migrate -- --all` | Apply every SQL migration via the Supabase pooler |
| `npm run check-schemas` | Verify this app's `tracker` schema is exposed to PostgREST |
| `npm run report:preview` | Render a Word report from fixture data — no database needed |

## Modules

| Route | What it does |
| --- | --- |
| `/dashboard` | KPI tiles, project progress, budget meters, due soon, recent activity |
| `/projects` | List and filter; detail carries milestones, tasks, budget, files, AI summary, report download |
| `/tasks` | Cross-project kanban and list |
| `/budgets` | Planned against actual, per project |
| `/files` | Private storage with short-lived signed URLs |
| `/settings` | Workspace, members, and the append-only activity log |
| `/demo` | UI showcase from fixture data — needs no database, no sign-in |
| `/login`, `/register` | Email/password sign-in and sign-up via Supabase Auth |

## Architecture notes

- **A screen never queries the database.** `app/**/page.tsx` → `lib/db/*` → Supabase.
- **RLS is the real security boundary.** The server runs queries as the
  signed-in user (cookie-based session, anon key); `0006_rls.sql`'s policies —
  not application code — decide who can read or write what. `requireRole()` is
  a courtesy that returns a clear error before RLS would reject the write.
- **Derived values are computed server-side.** `progress_pct` is maintained by a
  database trigger; health is derived at read time because it changes as dates
  pass; budget totals come from SQL views.
- **One currency per project**, inherited by budget lines and expenses, so a
  rollup can never add THB to USD.
- **AI is read-only.** It receives a snapshot assembled through `lib/db` and
  returns text. No tools, no writes.
- **Nothing is hard deleted.** Projects and tasks use `deleted_at`.

## Documentation

- `AGENTS.md` — coding rules and constraints. Read before writing code.
- `TASKS.md` — phased build plan, settled decisions, and the verification checklist.

## Notes

This app has its own dedicated Supabase project — nothing here is shared with
sibling apps. Its tables live in the `tracker` schema (a naming convention
carried over from when the project was shared, not a technical requirement),
and `0008_expose_schema.sql` appends to `pgrst.db_schemas` rather than
overwriting it, which stays harmless even on a single-schema project.
