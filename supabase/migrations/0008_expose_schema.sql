-- 0008_expose_schema.sql
-- Makes the `tracker` schema reachable via PostgREST (the Supabase API).
--
-- This project is SHARED with daily-budget-app / project-list-app / visa-flow /
-- tour-booking-app (public), visa-agency (agency) and bakery-pos (bakery), so
-- this must never assign a fixed list — doing that would silently un-expose a
-- sibling app's schema and take it offline. Instead it reads the current
-- setting and appends, and is a no-op if `tracker` is already there.
--
-- NOTE: re-run if the Supabase dashboard's API settings are ever re-saved,
-- since that can reset pgrst.db_schemas.

do $$
declare
  current_list text;
begin
  select substring(cfg from 'pgrst[.]db_schemas=(.*)')
    into current_list
  from pg_db_role_setting s
  join pg_roles r on r.oid = s.setrole,
       unnest(s.setconfig) as cfg
  where r.rolname = 'authenticator'
    and cfg like 'pgrst.db_schemas=%'
  limit 1;

  current_list := coalesce(current_list, 'public, graphql_public');

  if current_list ~ '(^|[, ])tracker([, ]|$)' then
    raise notice 'tracker already exposed: %', current_list;
    return;
  end if;

  execute format(
    'alter role authenticator set pgrst.db_schemas = %L',
    current_list || ', tracker'
  );
  raise notice 'exposed schemas now: %', current_list || ', tracker';
end $$;

notify pgrst, 'reload schema';
