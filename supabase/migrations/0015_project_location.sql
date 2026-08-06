-- 0015_project_location.sql
-- The handover report's overview section needs a site location distinct from
-- client_name (the entity billed) — e.g. "Kalasin waste-to-energy plant,
-- Kalasin" versus "VS Chem (1970) Company Limited". Free text, not a lookup
-- table: sites are one-offs, not a list the app manages.

alter table tracker.projects add column if not exists location text;
