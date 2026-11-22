-- Tripsplit: trips, the people on them, expenses and repayments.
--
-- Access rule: a signed-in user sees and edits a trip only if they have a row
-- in trip_access. Creating a trip adds the creator as owner automatically.
-- Money is stored as integer cents (bigint), never as floating point.

-- ---------------------------------------------------------------------------
-- Tables

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Which accounts may open a trip. Invitations (phase 4) will add rows here.
create table public.trip_access (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_access_user_id_idx on public.trip_access (user_id);

-- People on a trip. They don't need an account; user_id links one later (phase 4).
-- Removed people are soft-deleted, so old (deleted) expenses keep valid references.
create table public.members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  position integer not null default 0,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (trip_id, id)
);
create index members_trip_id_idx on public.members (trip_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  paid_by uuid not null,
  spent_on date not null,
  category text not null default 'other'
    check (category in ('accommodation', 'food', 'transport', 'groceries', 'activities', 'other')),
  split_type text not null check (split_type in ('equal', 'shares', 'exact')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (trip_id, id),
  -- The payer must be a person on the same trip.
  foreign key (trip_id, paid_by) references public.members (trip_id, id) deferrable initially deferred
);
create index expenses_trip_id_idx on public.expenses (trip_id);

-- Who takes part in an expense. equal/shares use weight, exact uses amount_cents.
create table public.expense_splits (
  trip_id uuid not null,
  expense_id uuid not null,
  member_id uuid not null,
  position integer not null default 0,
  weight integer check (weight > 0),
  amount_cents bigint check (amount_cents > 0),
  primary key (expense_id, member_id),
  check ((weight is null) <> (amount_cents is null)),
  foreign key (trip_id, expense_id) references public.expenses (trip_id, id) on delete cascade,
  foreign key (trip_id, member_id) references public.members (trip_id, id) deferrable initially deferred
);
create index expense_splits_member_idx on public.expense_splits (trip_id, member_id);

-- Recorded repayments ("Ben paid Anna back €20").
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  from_member uuid not null,
  to_member uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  settled_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  check (from_member <> to_member),
  foreign key (trip_id, from_member) references public.members (trip_id, id) deferrable initially deferred,
  foreign key (trip_id, to_member) references public.members (trip_id, id) deferrable initially deferred
);
create index settlements_trip_id_idx on public.settlements (trip_id);

-- ---------------------------------------------------------------------------
-- Access helpers. security definer so policies can read trip_access without
-- running into trip_access's own policy.

create function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_access
    where trip_id = p_trip_id and user_id = (select auth.uid())
  );
$$;

create function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_access
    where trip_id = p_trip_id and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

-- The creator of a trip becomes its owner.
create function public.add_trip_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    insert into public.trip_access (trip_id, user_id, role) values (new.id, (select auth.uid()), 'owner');
  end if;
  return new;
end;
$$;

create trigger trips_add_owner
  after insert on public.trips
  for each row execute function public.add_trip_owner();

-- ---------------------------------------------------------------------------
-- Row level security

alter table public.trips enable row level security;
alter table public.trip_access enable row level security;
alter table public.members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;

create policy "Trip members can read trips" on public.trips
  for select to authenticated using (public.is_trip_member(id));
create policy "Signed-in users can create trips" on public.trips
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "Trip members can update trips" on public.trips
  for update to authenticated using (public.is_trip_member(id)) with check (public.is_trip_member(id));
create policy "Trip owners can delete trips" on public.trips
  for delete to authenticated using (public.is_trip_owner(id));

create policy "Trip members can see who has access" on public.trip_access
  for select to authenticated using (public.is_trip_member(trip_id));

create policy "Trip members manage people" on public.members
  for all to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "Trip members manage expenses" on public.expenses
  for all to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "Trip members manage splits" on public.expense_splits
  for all to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "Trip members manage repayments" on public.settlements
  for all to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- Save functions. security invoker: they run with the caller's rights, so the
-- policies above still apply. Each call is one transaction.

-- Creates a trip or updates its name and people. p_members: [{ "id": uuid, "name": text }, ...]
-- People missing from p_members are removed (soft-deleted), unless they are still in use.
create function public.save_trip(p_trip_id uuid, p_name text, p_currency text, p_members jsonb)
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
    insert into public.members (id, trip_id, name, position)
    values ((v_member ->> 'id')::uuid, p_trip_id, btrim(v_member ->> 'name'), v_position)
    on conflict (id) do update
      set name = excluded.name, position = excluded.position, deleted_at = null
      where public.members.trip_id = excluded.trip_id;
    v_position := v_position + 1;
  end loop;
end;
$$;

-- Creates or updates an expense together with its split, in one transaction.
-- p_expense: { id, trip_id, title, amount_cents, currency, paid_by, spent_on, category, split_type }
-- p_splits:  [{ member_id, weight } ...] for equal/shares, [{ member_id, amount_cents } ...] for exact
create function public.save_expense(p_expense jsonb, p_splits jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p_expense ->> 'id')::uuid;
  v_trip_id uuid := (p_expense ->> 'trip_id')::uuid;
  v_amount bigint := (p_expense ->> 'amount_cents')::bigint;
  v_split_type text := p_expense ->> 'split_type';
  v_assigned bigint;
begin
  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'At least one person has to be part of the expense.' using errcode = 'check_violation';
  end if;

  if v_split_type = 'exact' then
    select coalesce(sum((value ->> 'amount_cents')::bigint), 0) into v_assigned from jsonb_array_elements(p_splits);
    if v_assigned <> v_amount then
      raise exception 'The individual amounts don''t add up to the total.' using errcode = 'check_violation';
    end if;
  end if;

  if exists (select 1 from public.expenses where id = v_id) then
    update public.expenses
    set title = btrim(p_expense ->> 'title'),
        amount_cents = v_amount,
        currency = coalesce(p_expense ->> 'currency', currency),
        paid_by = (p_expense ->> 'paid_by')::uuid,
        spent_on = (p_expense ->> 'spent_on')::date,
        category = coalesce(p_expense ->> 'category', 'other'),
        split_type = v_split_type,
        updated_at = now()
    where id = v_id and trip_id = v_trip_id;
    if not found then
      raise exception 'Expense not found in this trip.' using errcode = 'no_data_found';
    end if;
  else
    insert into public.expenses (id, trip_id, title, amount_cents, currency, paid_by, spent_on, category, split_type)
    values (
      v_id,
      v_trip_id,
      btrim(p_expense ->> 'title'),
      v_amount,
      coalesce(p_expense ->> 'currency', 'EUR'),
      (p_expense ->> 'paid_by')::uuid,
      (p_expense ->> 'spent_on')::date,
      coalesce(p_expense ->> 'category', 'other'),
      v_split_type
    );
  end if;

  delete from public.expense_splits where expense_id = v_id;

  insert into public.expense_splits (trip_id, expense_id, member_id, position, weight, amount_cents)
  select
    v_trip_id,
    v_id,
    (split.value ->> 'member_id')::uuid,
    (split.ordinality - 1)::integer,
    (split.value ->> 'weight')::integer,
    (split.value ->> 'amount_cents')::bigint
  from jsonb_array_elements(p_splits) with ordinality as split (value, ordinality);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: only signed-in users, and only through the policies above.

revoke all on public.trips, public.trip_access, public.members, public.expenses, public.expense_splits, public.settlements
  from anon;
grant select, insert, update, delete on public.trips, public.members, public.expenses, public.expense_splits, public.settlements
  to authenticated;
grant select on public.trip_access to authenticated;

revoke execute on function public.save_trip(uuid, text, text, jsonb), public.save_expense(jsonb, jsonb) from public, anon;
grant execute on function public.save_trip(uuid, text, text, jsonb), public.save_expense(jsonb, jsonb) to authenticated;
