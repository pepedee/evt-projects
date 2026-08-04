-- 0005_ai_audit.sql
-- AI summary cache, generated-report log, and the audit trail.

-- Summaries are cached on a hash of the exact snapshot they were generated
-- from. An unchanged project therefore costs nothing to re-summarise, and a
-- changed one can never serve a stale answer.
create table if not exists tracker.ai_summaries (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references tracker.workspaces(id) on delete cascade,
  project_id        uuid not null references tracker.projects(id) on delete cascade,
  kind              text not null
                    check (kind in ('project_status','risk_scan','standup','report_intro')),
  content           text not null,
  model             text not null,
  input_hash        text not null,
  prompt_tokens     int,
  completion_tokens int,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create unique index if not exists ai_summaries_cache_key
  on tracker.ai_summaries (project_id, kind, input_hash);
create index if not exists ai_summaries_project_idx
  on tracker.ai_summaries (project_id, kind, created_at desc);

create table if not exists tracker.report_jobs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  project_id   uuid references tracker.projects(id) on delete cascade,
  kind         text not null default 'project_status',
  format       text not null default 'docx' check (format in ('docx','xlsx','csv')),
  file_name    text not null,
  status       text not null default 'completed'
               check (status in ('pending','completed','failed')),
  error        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists report_jobs_workspace_idx
  on tracker.report_jobs (workspace_id, created_at desc);

-- Append-only history of who changed what. Never updated, never deleted.
create table if not exists tracker.activity_logs (
  id           bigserial primary key,
  workspace_id uuid not null references tracker.workspaces(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  entity       text not null,
  entity_id    text,
  action       text not null,
  summary      text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists activity_logs_workspace_idx
  on tracker.activity_logs (workspace_id, created_at desc);
create index if not exists activity_logs_entity_idx
  on tracker.activity_logs (entity, entity_id);

create trigger ai_summaries_set_workspace
  before insert or update of project_id on tracker.ai_summaries
  for each row execute function tracker.set_workspace_from_project();
