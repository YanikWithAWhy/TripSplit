-- Receipts: a photo of the receipt attached to an expense.
--
-- The photos live in a private Storage bucket, one folder per trip and expense:
--   receipts/<trip id>/<expense id>/<file id>.jpg
-- Everyone on the trip can look at them. Adding or deleting one follows the same
-- rule as changing the expense: its author or the trip owner (for a new expense,
-- which doesn't exist yet while its photo uploads: anyone on the trip).
-- The app shrinks photos before uploading, so they stay well below the size limit.

-- Bucket ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Expenses point at their photo ------------------------------------------------

alter table public.expenses add column receipt_path text;

-- Only a file in this expense's own folder.
alter table public.expenses add constraint expenses_receipt_path_check check (
  receipt_path is null
  or receipt_path ~ ('^' || trip_id::text || '/' || id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$')
);

-- Same as before, plus the receipt. Callers that don't send receipt_path (an
-- older version of the app) leave the photo as it is.
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
  v_has_receipt boolean := p_expense ? 'receipt_path';
  v_receipt text := nullif(p_expense ->> 'receipt_path', '');
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
        receipt_path = case when v_has_receipt then v_receipt else receipt_path end,
        updated_at = now()
    where id = v_id and trip_id = v_trip_id;
    if not found then
      raise exception 'Expense not found in this trip.' using errcode = 'no_data_found';
    end if;
  else
    insert into public.expenses (id, trip_id, title, amount_cents, currency, paid_by, spent_on, category, split_type, receipt_path)
    values (
      v_id,
      v_trip_id,
      btrim(p_expense ->> 'title'),
      v_amount,
      coalesce(p_expense ->> 'currency', 'EUR'),
      (p_expense ->> 'paid_by')::uuid,
      (p_expense ->> 'spent_on')::date,
      coalesce(p_expense ->> 'category', 'other'),
      v_split_type,
      v_receipt
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

-- Who may do what with a file ---------------------------------------------------

-- '<trip id>/<expense id>/<file>' → the trip id (part 1) or expense id (part 2).
-- null for anything else, so odd paths never match a policy.
create function public.receipt_path_id(p_name text, p_part integer)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_part in (1, 2)
      and p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'
    then split_part(p_name, '/', p_part)::uuid
  end;
$$;

-- May the caller add or delete this file? Someone on the trip who may change the
-- expense, or anyone on the trip while the expense doesn't exist yet.
create function public.can_change_receipt(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_trip_member(public.receipt_path_id(p_name, 1))
    and case
      when exists (select 1 from public.expenses where id = public.receipt_path_id(p_name, 2)) then
        exists (
          select 1 from public.expenses
          where id = public.receipt_path_id(p_name, 2) and trip_id = public.receipt_path_id(p_name, 1)
        )
        and public.can_edit_expense(public.receipt_path_id(p_name, 2))
      else true
    end;
$$;

drop policy if exists "Receipts: trip members can look at them" on storage.objects;
drop policy if exists "Receipts: people who may change the expense can add them" on storage.objects;
drop policy if exists "Receipts: people who may change the expense can delete them" on storage.objects;

create policy "Receipts: trip members can look at them" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.is_trip_member(public.receipt_path_id(name, 1)));
create policy "Receipts: people who may change the expense can add them" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_change_receipt(name));
create policy "Receipts: people who may change the expense can delete them" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and public.can_change_receipt(name));
-- No update policy: a new photo is a new file, the old one gets deleted.

-- Deleting an account ---------------------------------------------------------------

-- Photos in the trips that delete_my_account() deletes (owned by the caller, nobody
-- else on them). Files can only be removed through the Storage API, so the app
-- removes these before it deletes the account.
create function public.my_solo_trip_receipts()
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(e.receipt_path order by e.receipt_path), '{}')
  from public.expenses e
  join public.trip_access mine
    on mine.trip_id = e.trip_id and mine.user_id = (select auth.uid()) and mine.role = 'owner'
  where e.receipt_path is not null
    and not exists (
      select 1 from public.trip_access other
      where other.trip_id = e.trip_id and other.user_id <> (select auth.uid())
    );
$$;

revoke execute on function
  public.receipt_path_id(text, integer),
  public.can_change_receipt(text),
  public.my_solo_trip_receipts()
from public, anon;
grant execute on function
  public.receipt_path_id(text, integer),
  public.can_change_receipt(text),
  public.my_solo_trip_receipts()
to authenticated;
