-- Enable RLS and add safe policies for profiles, license_keys, user_uploads, scan_results

-- PROFILES
alter table if exists public.profiles enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own on public.profiles
      for select using (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_self'
  ) then
    create policy profiles_insert_self on public.profiles
      for insert with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own on public.profiles
      for update using (user_id = auth.uid());
  end if;
end $$;

-- LICENSE_KEYS
alter table if exists public.license_keys enable row level security;

-- Allow authenticated users to read license keys to validate
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'license_keys' and policyname = 'license_keys_select_all_auth'
  ) then
    create policy license_keys_select_all_auth on public.license_keys
      for select to authenticated using (true);
  end if;
end $$;

-- Allow authenticated users to mark a key as used when they own the row (set used_by to themselves)
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'license_keys' and policyname = 'license_keys_update_mark_used'
  ) then
    create policy license_keys_update_mark_used on public.license_keys
      for update to authenticated using (used_by is null or used_by = auth.uid()) with check (used_by = auth.uid());
  end if;
end $$;

-- USER_UPLOADS
alter table if exists public.user_uploads enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_uploads' and policyname = 'user_uploads_select_own'
  ) then
    create policy user_uploads_select_own on public.user_uploads
      for select using (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_uploads' and policyname = 'user_uploads_insert_self'
  ) then
    create policy user_uploads_insert_self on public.user_uploads
      for insert with check (user_id = auth.uid());
  end if;
end $$;

-- SCAN_RESULTS
alter table if exists public.scan_results enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'scan_results' and policyname = 'scan_results_select_own'
  ) then
    create policy scan_results_select_own on public.scan_results
      for select using (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'scan_results' and policyname = 'scan_results_insert_self'
  ) then
    create policy scan_results_insert_self on public.scan_results
      for insert with check (user_id = auth.uid());
  end if;
end $$;


