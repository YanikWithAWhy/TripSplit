-- Invitations: add friends to a trip by their username.
-- The friend sees the invitation and decides. Only after accepting do they get
-- access to the trip and get linked to their person in it.
-- All changes go through the functions below; clients can only read.

create table public.trip_invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  -- The person in the trip the friend will become.
  member_id uuid not null,
  invited_user uuid not null references auth.users (id) on delete cascade,
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  foreign key (trip_id, member_id) references public.members (trip_id, id) on delete cascade
);

-- At most one open invitation per account and trip, and per person.
create unique index trip_invitations_pending_user_key on public.trip_invitations (trip_id, invited_user)
  where status = 'pending';
create unique index trip_invitations_pending_member_key on public.trip_invitations (member_id)
  where status = 'pending';
create index trip_invitations_invited_user_idx on public.trip_invitations (invited_user)
  where status = 'pending';

alter table public.trip_invitations enable row level security;

create policy "Trip members and invitees can see invitations" on public.trip_invitations
  for select to authenticated using (public.is_trip_member(trip_id) or invited_user = (select auth.uid()));

revoke all on public.trip_invitations from anon;
grant select on public.trip_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Usernames of fellow travellers become visible (still nobody else's).

create function public.can_see_profile(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user = (select auth.uid())
    -- someone I share a trip with
    or exists (
      select 1
      from public.trip_access mine
      join public.trip_access theirs on theirs.trip_id = mine.trip_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
    )
    -- someone invited to one of my trips
    or exists (
      select 1
      from public.trip_access mine
      join public.trip_invitations i on i.trip_id = mine.trip_id
      where mine.user_id = (select auth.uid()) and i.invited_user = p_user and i.status = 'pending'
    )
    -- whoever invited me
    or exists (
      select 1 from public.trip_invitations i
      where i.invited_user = (select auth.uid()) and i.invited_by = p_user and i.status = 'pending'
    );
$$;

create policy "Users can see people they share a trip with" on public.profiles
  for select to authenticated using (public.can_see_profile(id));

-- ---------------------------------------------------------------------------
-- Username suggestions for the invite field: up to 5 usernames starting with the
-- query (at least 2 characters). Leaves out yourself and, for a trip, everyone
-- who is already in it or invited.

create function public.search_usernames(p_query text, p_trip_id uuid default null)
returns table (username text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := left(ltrim(lower(btrim(coalesce(p_query, ''))), '@'), 20);
  v_pattern text;
begin
  if (select auth.uid()) is null then
    raise exception 'Please sign in.' using errcode = 'insufficient_privilege';
  end if;
  if p_trip_id is not null and not public.is_trip_member(p_trip_id) then
    raise exception 'Trip not found.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_query) < 2 then
    return;
  end if;

  -- "_" is a wildcard in LIKE, and usernames may contain it: escape it.
  v_pattern := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select p.username
    from public.profiles p
    where p.username like v_pattern escape '\'
      and p.id <> (select auth.uid())
      and (
        p_trip_id is null
        or (
          not exists (select 1 from public.trip_access a where a.trip_id = p_trip_id and a.user_id = p.id)
          and not exists (
            select 1 from public.trip_invitations i
            where i.trip_id = p_trip_id and i.invited_user = p.id and i.status = 'pending'
          )
        )
      )
    order by p.username
    limit 5;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invite someone by username. Without p_member_id a new person (named like the
-- username) is added to the trip; with it, that existing person is used.
-- Returns the person's id.

create function public.invite_to_trip(p_trip_id uuid, p_username text, p_member_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_username text := ltrim(lower(btrim(coalesce(p_username, ''))), '@');
  v_user uuid;
  v_member uuid := p_member_id;
begin
  if v_me is null or not public.is_trip_member(p_trip_id) then
    raise exception 'Trip not found.' using errcode = 'insufficient_privilege';
  end if;

  select id into v_user from public.profiles where username = v_username;
  if v_user is null then
    raise exception 'There is no account with the username @%.', v_username using errcode = 'no_data_found';
  end if;
  if v_user = v_me then
    raise exception 'That''s you.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.trip_access where trip_id = p_trip_id and user_id = v_user) then
    raise exception '@% is already in this trip.', v_username using errcode = 'unique_violation';
  end if;
  if exists (
    select 1 from public.trip_invitations
    where trip_id = p_trip_id and invited_user = v_user and status = 'pending'
  ) then
    raise exception '@% has already been invited.', v_username using errcode = 'unique_violation';
  end if;

  if v_member is null then
    insert into public.members (trip_id, name, position)
    values (
      p_trip_id,
      v_username,
      coalesce((select max(position) + 1 from public.members where trip_id = p_trip_id), 0)
    )
    returning id into v_member;
  elsif not exists (
    select 1 from public.members m
    where m.id = v_member
      and m.trip_id = p_trip_id
      and m.deleted_at is null
      and m.user_id is null
      and not exists (select 1 from public.trip_invitations i where i.member_id = m.id and i.status = 'pending')
  ) then
    raise exception 'This person is already linked to an account or invited.' using errcode = 'check_violation';
  end if;

  insert into public.trip_invitations (trip_id, member_id, invited_user, invited_by)
  values (p_trip_id, v_member, v_user, v_me);

  return v_member;
end;
$$;

-- Anyone on the trip can take back an open invitation.
create function public.cancel_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trip_invitations
  set status = 'cancelled', responded_at = now()
  where id = p_invitation_id and status = 'pending' and public.is_trip_member(trip_id);
  if not found then
    raise exception 'Invitation not found.' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Open invitations for the signed-in user, with what they need to decide.
create function public.my_invitations()
returns table (
  id uuid,
  trip_id uuid,
  trip_name text,
  invited_by_username text,
  member_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.trip_id, t.name, p.username, m.name, i.created_at
  from public.trip_invitations i
  join public.trips t on t.id = i.trip_id
  join public.members m on m.id = i.member_id
  left join public.profiles p on p.id = i.invited_by
  where i.invited_user = (select auth.uid()) and i.status = 'pending' and m.deleted_at is null
  order by i.created_at desc;
$$;

-- Accept (join the trip as that person) or decline. Returns the trip id.
create function public.respond_to_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_invitation public.trip_invitations%rowtype;
begin
  select * into v_invitation
  from public.trip_invitations
  where id = p_invitation_id and invited_user = v_me and status = 'pending'
  for update;
  if not found then
    raise exception 'This invitation is no longer valid.' using errcode = 'no_data_found';
  end if;

  if not p_accept then
    update public.trip_invitations set status = 'declined', responded_at = now() where id = v_invitation.id;
    return v_invitation.trip_id;
  end if;

  update public.members
  set user_id = v_me
  where id = v_invitation.member_id and trip_id = v_invitation.trip_id and deleted_at is null and user_id is null;
  if not found then
    raise exception 'This invitation is no longer valid.' using errcode = 'check_violation';
  end if;

  insert into public.trip_access (trip_id, user_id, role)
  values (v_invitation.trip_id, v_me, 'editor')
  on conflict (trip_id, user_id) do nothing;

  update public.trip_invitations set status = 'accepted', responded_at = now() where id = v_invitation.id;
  return v_invitation.trip_id;
end;
$$;

-- Leave a trip you were invited to. You stay in the expenses as a person, just
-- no longer linked to your account. Owners delete the trip instead.
create function public.leave_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or not public.is_trip_member(p_trip_id) then
    raise exception 'Trip not found.' using errcode = 'insufficient_privilege';
  end if;
  if public.is_trip_owner(p_trip_id) then
    raise exception 'The owner can''t leave the trip. Delete it instead.' using errcode = 'check_violation';
  end if;
  update public.members set user_id = null where trip_id = p_trip_id and user_id = v_me;
  delete from public.trip_access where trip_id = p_trip_id and user_id = v_me;
end;
$$;

-- Removing a person from a trip also takes back their open invitation.
create function public.cancel_invitations_of_removed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.trip_invitations
    set status = 'cancelled', responded_at = now()
    where member_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger members_cancel_invitations
  after update of deleted_at on public.members
  for each row execute function public.cancel_invitations_of_removed_member();

-- ---------------------------------------------------------------------------

revoke execute on function
  public.search_usernames(text, uuid),
  public.invite_to_trip(uuid, text, uuid),
  public.cancel_invitation(uuid),
  public.my_invitations(),
  public.respond_to_invitation(uuid, boolean),
  public.leave_trip(uuid)
from public, anon;

grant execute on function
  public.search_usernames(text, uuid),
  public.invite_to_trip(uuid, text, uuid),
  public.cancel_invitation(uuid),
  public.my_invitations(),
  public.respond_to_invitation(uuid, boolean),
  public.leave_trip(uuid)
to authenticated;
