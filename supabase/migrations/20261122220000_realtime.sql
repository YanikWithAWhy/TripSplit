-- Live updates: Supabase Realtime sends changes of these tables to signed-in
-- clients. Row level security still applies, so everyone only hears about
-- trips they are part of (and about invitations meant for them).
-- (Deletes only carry the row's id, so nothing readable leaks.)
--
-- Safe to run more than once: tables already in the publication are skipped.

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime not found; skipping (not a Supabase database?).';
    return;
  end if;

  foreach v_table in array array[
    'trips', 'trip_access', 'members', 'expenses', 'expense_splits', 'settlements', 'trip_invitations'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
