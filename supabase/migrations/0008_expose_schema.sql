-- 0008_expose_schema.sql
-- Makes the `tracker` schema reachable via PostgREST (the Supabase API).
--
-- This project is dedicated to this app, so there's no sibling schema at risk
-- today. It still reads the current setting and appends rather than assigning
-- a fixed list, and is a no-op if `tracker` is already there — cheap safety
-- that costs nothing to keep even with a single schema.
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
