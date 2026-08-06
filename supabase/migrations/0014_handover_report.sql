-- 0014_handover_report.sql
-- Support for the construction handover/completion report: document
-- categories so uploads sort into report sections, and a way to mark a task
-- as a defect/snag item rather than ordinary work.

alter table tracker.documents
  add column if not exists category text not null default 'other'
  check (category in (
    'photo', 'as_built_drawing', 'inspection_certificate', 'warranty',
    'om_manual', 'other'
  ));

-- A defect is still a task (it has a title, status, who's on it) — it just
-- means something different in a handover report: 'todo'/'in_progress' reads
-- as "open defect", 'done' reads as "rectified". No separate table needed.
alter table tracker.tasks
  add column if not exists kind text not null default 'task'
  check (kind in ('task', 'defect'));

-- ai_summaries.kind is a closed check constraint; the handover report's
-- AI-drafted summary needs its own kind so it caches separately from the
-- existing status-report summary (different prompt, different snapshot).
alter table tracker.ai_summaries drop constraint if exists ai_summaries_kind_check;
alter table tracker.ai_summaries add constraint ai_summaries_kind_check
  check (kind in ('project_status', 'risk_scan', 'standup', 'report_intro', 'handover_summary'));
