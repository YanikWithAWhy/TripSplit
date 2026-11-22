-- Profiles: one per account, with a unique username.
-- A profile is created after the user confirmed their email through the sign-up link.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Stored lowercase: 3–20 letters, numbers, "_" or ".".
  username text not null check (username ~ '^[a-z0-9_.]{3,20}$'),
  created_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (username);

alter table public.profiles enable row level security;

create policy "Users can read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Users can create their own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "Users can change their own username" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Lets the sign-up form check a username without exposing other profiles.
create function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where username = lower(btrim(p_username)));
$$;

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

revoke execute on function public.is_username_available(text) from public, anon;
grant execute on function public.is_username_available(text) to authenticated;
