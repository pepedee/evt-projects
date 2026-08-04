# AI Project Tracker

Track projects end to end — tasks, milestones, budgets, files — with AI-written
status summaries and generated Word reports.

Single user today, multi-user ready: everything is scoped by `workspace_id`, so
adding teammates is a data change, not a migration.

## Stack

Next.js 16 (App Router, React 19, TypeScript) · Tailwind CSS v4 · Supabase
Postgres (`tracker` schema) · Supabase Auth · Supabase Storage · zod ·
Anthropic Claude API · `docx` · Vercel.

## Getting started

```bash
npm install
```

Copy `.env.local.example` to `.env.local` and fill in the Supabase anon key and
your `ANTHROPIC_API_KEY`.

Apply the database migrations:

```bash
npm run migrate -- --all
```

Run the dev server (port 3006):

```bash
npm run dev
```

## Documentation

- `AGENTS.md` — coding rules and architecture constraints. Read before writing code.
- `TASKS.md` — the phased build plan and settled decisions.

## Notes

This app shares one Supabase project with six sibling apps. Its tables live in
the `tracker` schema. The `expose_schema` migration **appends** to
`pgrst.db_schemas` — rewriting it would break the sibling apps.
