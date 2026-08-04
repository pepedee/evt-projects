-- 0000_schema.sql
-- This app lives in its own schema so it can share a Supabase project with the
-- sibling apps without ever colliding with their tables.
--   public  -> daily-budget-app, project-list-app, visa-flow, tour-booking-app
--   agency  -> visa-agency
--   bakery  -> bakery-pos
--   tracker -> this app

create schema if not exists tracker;

grant usage on schema tracker to anon, authenticated, service_role;

-- Anything created later in this schema is reachable by the API roles.
-- Row Level Security (0005) is what actually decides who sees which rows.
alter default privileges in schema tracker
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema tracker
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema tracker
  grant all on sequences to anon, authenticated, service_role;

-- Keeps updated_at honest without the application having to remember.
create or replace function tracker.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
