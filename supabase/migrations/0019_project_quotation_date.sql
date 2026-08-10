-- 0019_project_quotation_date.sql
-- The date printed on the quotation/PO a project was created from — distinct
-- from start_date (when work actually begins, often weeks or months later).
-- Free date field, same shape as start_date/target_date.

alter table tracker.projects add column if not exists quotation_date date;
