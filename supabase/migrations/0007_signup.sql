-- 0007_signup.sql
-- A new account gets its own workspace and is the owner of it.
--
-- SECURITY DEFINER because it runs as the Supabase auth system inserting into
-- auth.users, before the new user has any membership to satisfy RLS with.
--
-- IMPORTANT: auth.users is shared with six sibling apps. A trigger that raises
-- here would abort the INSERT and break account creation for *all* of them.
-- So the work is wrapped in an exception handler: if provisioning fails we log
-- a warning and still let the signup through. tracker.ensure_workspace() below
-- repairs the missing workspace on the user's next request.

create or replace function tracker.provision_workspace(
  p_user  uuid,
  p_name  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace uuid;
begin
  -- Already provisioned: hand back the existing workspace, do not make another.
  select m.workspace_id into new_workspace
  from tracker.workspace_members m
  where m.user_id = p_user
  order by m.created_at
  limit 1;

  if new_workspace is not null then
    return new_workspace;
  end if;

  insert into tracker.workspaces (name, created_by)
  values (p_name || '''s workspace', p_user)
  returning id into new_workspace;

  insert into tracker.workspace_members (workspace_id, user_id, role, full_name)
  values (new_workspace, p_user, 'owner', p_name);

  return new_workspace;
end;
$$;

/**
 * Called by the app for the signed-in user. Makes a workspace if the signup
 * trigger never ran — which covers accounts that already existed before this
 * app was built, and any transient failure in the trigger.
 */
create or replace function tracker.ensure_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  mail text;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select u.email into mail from auth.users u where u.id = uid;

  return tracker.provision_workspace(
    uid,
    coalesce(nullif(split_part(mail, '@', 1), ''), 'My')
  );
end;
$$;

grant execute on function tracker.ensure_workspace() to authenticated;

create or replace function tracker.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform tracker.provision_workspace(
      new.id,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(split_part(new.email, '@', 1), ''),
        'My'
      )
    );
  exception when others then
    -- Never block account creation for the sibling apps sharing auth.users.
    raise warning 'tracker: workspace provisioning failed for %: %',
      new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- The sibling apps also hang triggers off auth.users; each uses its own name
-- so they coexist rather than replacing one another.
drop trigger if exists on_auth_user_created_tracker on auth.users;

create trigger on_auth_user_created_tracker
  after insert on auth.users
  for each row execute function tracker.handle_new_user();
