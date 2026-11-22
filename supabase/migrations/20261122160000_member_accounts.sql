-- Links people on a trip to accounts (members.user_id).
-- The creator's own person is linked when the trip is created; later (phase 4)
-- invited friends link themselves. Nobody can link someone else's account.

-- One person per account and trip.
create unique index members_trip_user_key on public.members (trip_id, user_id)
  where user_id is not null and deleted_at is null;

-- Same signature as before; p_members items may now carry "user_id".
-- It is only accepted when it is the caller's own id, and an existing link is never replaced.
create or replace function public.save_trip(p_trip_id uuid, p_name text, p_currency text, p_members jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_member jsonb;
  v_position integer := 0;
  v_kept uuid[];
begin
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) < 2 then
    raise exception 'A trip needs at least two people.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.trips where id = p_trip_id) then
    update public.trips set name = btrim(p_name) where id = p_trip_id;
  else
    insert into public.trips (id, name, currency) values (p_trip_id, btrim(p_name), coalesce(p_currency, 'EUR'));
  end if;

  v_kept := array(select (value ->> 'id')::uuid from jsonb_array_elements(p_members));

  if exists (
    select 1 from public.members m
    where m.trip_id = p_trip_id and m.deleted_at is null and m.id <> all (v_kept) and m.user_id is not null
  ) then
    raise exception 'People who are linked to an account can''t be removed.' using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from public.members m
    where m.trip_id = p_trip_id
      and m.deleted_at is null
      and m.id <> all (v_kept)
      and (
        exists (
          select 1 from public.expenses e
          where e.trip_id = p_trip_id
            and e.deleted_at is null
            and (
              e.paid_by = m.id
              or exists (select 1 from public.expense_splits s where s.expense_id = e.id and s.member_id = m.id)
            )
        )
        or exists (
          select 1 from public.settlements st
          where st.trip_id = p_trip_id and m.id in (st.from_member, st.to_member)
        )
      )
  ) then
    raise exception 'People who are part of expenses or repayments can''t be removed.' using errcode = 'check_violation';
  end if;

  update public.members
  set deleted_at = now()
  where trip_id = p_trip_id and deleted_at is null and id <> all (v_kept);

  for v_member in select value from jsonb_array_elements(p_members) loop
    insert into public.members (id, trip_id, name, position, user_id)
    values (
      (v_member ->> 'id')::uuid,
      p_trip_id,
      btrim(v_member ->> 'name'),
      v_position,
      case when (v_member ->> 'user_id')::uuid = (select auth.uid()) then (select auth.uid()) end
    )
    on conflict (id) do update
      set name = excluded.name,
          position = excluded.position,
          deleted_at = null,
          user_id = coalesce(public.members.user_id, excluded.user_id)
      where public.members.trip_id = excluded.trip_id;
    v_position := v_position + 1;
  end loop;
end;
$$;
