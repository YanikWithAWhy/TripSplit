-- Account settings: change your username, delete your account (GDPR, right to erasure).

-- Changes the caller's username. People in trips who were named after the old
-- username (the usual case for accounts) follow the new one.
create function public.change_username(p_username text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_new text := lower(btrim(coalesce(p_username, '')));
  v_old text;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  if v_new !~ '^[a-z0-9_.]{3,20}$' then
    raise exception 'Use 3–20 letters, numbers, _ or .' using errcode = 'check_violation';
  end if;

  select username into v_old from public.profiles where id = v_user;
  if v_old is null then
    raise exception 'Finish setting up your account first.' using errcode = 'no_data_found';
  end if;
  if v_old = v_new then
    return;
  end if;

  -- Fails with a unique violation when the name is taken.
  update public.profiles set username = v_new where id = v_user;

  update public.members
  set name = v_new
  where user_id = v_user and deleted_at is null and lower(name) = v_old;
end;
$$;

-- Deletes the caller's account and everything that only belongs to them.
-- * Trips they own and share with others go to the member who joined first.
-- * Trips nobody else has joined are deleted with all their data.
-- * In other people's trips they stay as a plain name (members.user_id becomes null),
--   so everyone else's expenses and balances stay correct.
-- security definer: deleting from auth.users and handing over trips needs more rights than
-- the caller has. It only ever acts on the caller's own account (auth.uid()).
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_trip_id uuid;
  v_heir uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  for v_trip_id in
    select trip_id from public.trip_access where user_id = v_user and role = 'owner'
  loop
    select user_id into v_heir
    from public.trip_access
    where trip_id = v_trip_id and user_id <> v_user
    order by created_at, user_id
    limit 1;

    if v_heir is null then
      delete from public.trips where id = v_trip_id;
    else
      update public.trip_access set role = 'owner' where trip_id = v_trip_id and user_id = v_heir;
      update public.trips set created_by = v_heir where id = v_trip_id;
    end if;
  end loop;

  -- Invitations they haven't answered are no longer needed.
  delete from public.trip_invitations where invited_user = v_user;

  -- Removes profile, trip access and login data; links in trips become empty (see foreign keys).
  delete from auth.users where id = v_user;
end;
$$;

revoke execute on function public.change_username(text), public.delete_my_account() from public, anon;
grant execute on function public.change_username(text), public.delete_my_account() to authenticated;
