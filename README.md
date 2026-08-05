# AI Project Tracker

Track projects end to end — tasks, milestones, budgets, files — with AI-written
status summaries and generated Word reports.

> ### ⚠️ This app has no authentication
>
> There is no sign-in. Everyone who can reach the app shares one workspace and
> can read and write everything in it — projects, budgets, client names and
> uploaded documents. That is fine on localhost or a private network. **Do not
> put it on a public URL** without restoring authentication (change
> `lib/auth.ts`, revert `0012_open_access.sql`).

## Stack

Next.js 16 (App Router, React 19, TypeScript) · Tailwind CSS v4 · Supabase
Postgres (`tracker` schema) · Supabase Auth · Supabase Storage · zod ·
Anthropic Claude API · `docx` · Vercel.

## Getting started

```bash
npm install
```

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Shared Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server only.** Bypasses RLS — never prefix `NEXT_PUBLIC_`, never commit |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | Only needed if you restore authentication |
| `ANTHROPIC_API_KEY` | no | Without it, AI summaries are hidden and reports are generated without their prose sections |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5` |

Apply the database migrations, then confirm the sibling apps still work:

```bash
npm run migrate -- --all
```

```bash
node scripts/check-schemas.mjs
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
| `node scripts/check-schemas.mjs` | Verify the sibling apps' schemas are still exposed |
| `npm run report:preview` | Render a Word report from fixture data — no database needed |

## Modules

| Route | What it does |
| --- | --- |
| `/dashboard` | KPI tiles, project progress, budget meters, due soon, recent activity |
| `/projects` | List and filter; detail carries milestones, tasks, budget, files, AI summary, report download |
| `/tasks` | Cross-project kanban and list |
| `/budgets` | Planned against actual, per project |
| `/files` | Private storage with short-lived signed URLs |
| `/settings` | Workspace, access model, and the append-only activity log |
| `/demo` | UI showcase from fixture data — needs no database |

## Architecture notes

- **A screen never queries the database.** `app/**/page.tsx` → `lib/db/*` → Supabase.
- **There is no security boundary inside the app.** With authentication removed
  the server uses the service-role key, which bypasses RLS; reachability is the
  only gate. `requireRole()` is kept as a marker of which operations were
  privileged, so auth can be restored from one file.
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

This app shares one Supabase project with six sibling apps. Its tables live in
the `tracker` schema, and `0008_expose_schema.sql` **appends** to
`pgrst.db_schemas` — rewriting it to assign a fixed list would take the sibling
apps offline.
