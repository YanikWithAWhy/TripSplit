-- Who may change what inside a trip:
-- * Expenses: everyone on the trip can read and add them. Only the person who added
--   an expense, or the trip's owner, can change or delete it.
-- * Repayments: only someone who is part of a repayment (payer or receiver,
--   linked to their account) can record or undo it.

-- Is p_member_id the caller's own person in this trip?
create function public.is_my_member(p_trip_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where trip_id = p_trip_id and id = p_member_id and user_id = (select auth.uid()) and deleted_at is null
  );
$$;

-- May the caller change this expense (author or trip owner)?
create function public.can_edit_expense(p_expense_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense_id
      and (e.created_by = (select auth.uid()) or public.is_trip_owner(e.trip_id))
  );
$$;

-- Expenses ---------------------------------------------------------------

drop policy "Trip members manage expenses" on public.expenses;

create policy "Trip members can read expenses" on public.expenses
  for select to authenticated using (public.is_trip_member(trip_id));
create policy "Trip members can add expenses as themselves" on public.expenses
  for insert to authenticated with check (public.is_trip_member(trip_id) and created_by = (select auth.uid()));
create policy "Authors and trip owners can change expenses" on public.expenses
  for update to authenticated
  using (public.is_trip_member(trip_id) and (created_by = (select auth.uid()) or public.is_trip_owner(trip_id)))
  with check (public.is_trip_member(trip_id));
create policy "Authors and trip owners can delete expenses" on public.expenses
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_trip_owner(trip_id));

drop policy "Trip members manage splits" on public.expense_splits;

create policy "Trip members can read splits" on public.expense_splits
  for select to authenticated using (public.is_trip_member(trip_id));
create policy "Authors and trip owners can add splits" on public.expense_splits
  for insert to authenticated with check (public.is_trip_member(trip_id) and public.can_edit_expense(expense_id));
create policy "Authors and trip owners can change splits" on public.expense_splits
  for update to authenticated
  using (public.can_edit_expense(expense_id))
  with check (public.is_trip_member(trip_id) and public.can_edit_expense(expense_id));
create policy "Authors and trip owners can delete splits" on public.expense_splits
  for delete to authenticated using (public.can_edit_expense(expense_id));

-- Same as before, plus a clear message when someone else's expense is edited.
create or replace function public.save_expense(p_expense jsonb, p_splits jsonb)
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
    if not public.can_edit_expense(v_id) then
      raise exception 'Only the person who added this expense can change it.' using errcode = 'insufficient_privilege';
    end if;
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

-- Repayments -------------------------------------------------------------

drop policy "Trip members manage repayments" on public.settlements;

create policy "Trip members can read repayments" on public.settlements
  for select to authenticated using (public.is_trip_member(trip_id));
create policy "People can record repayments they are part of" on public.settlements
  for insert to authenticated
  with check (
    public.is_trip_member(trip_id)
    and (public.is_my_member(trip_id, from_member) or public.is_my_member(trip_id, to_member))
  );
create policy "People can undo repayments they are part of" on public.settlements
  for delete to authenticated
  using (public.is_my_member(trip_id, from_member) or public.is_my_member(trip_id, to_member));
