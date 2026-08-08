-- Pet Alert PH: one-time legacy ownership recovery.
-- This version matches the migration choice where normal email confirmation is disabled.

create table if not exists public.legacy_account_map (
  legacy_user_id uuid primary key,
  legacy_email text not null,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists legacy_account_map_email_idx
on public.legacy_account_map(lower(legacy_email));

alter table public.legacy_account_map enable row level security;

alter table public.missing_dogs add column if not exists legacy_owner_id uuid;
alter table public.sightings add column if not exists legacy_owner_id uuid;

create or replace function public.check_legacy_pet_alert_reports()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_email text;
  v_legacy_id uuid;
  v_report_count integer := 0;
  v_sighting_count integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('available', false, 'reports', 0, 'sightings', 0);
  end if;

  select lower(email) into v_email from auth.users where id = v_user_id;
  if v_email is null then
    return jsonb_build_object('available', false, 'reports', 0, 'sightings', 0);
  end if;

  select legacy_user_id into v_legacy_id
  from public.legacy_account_map
  where lower(legacy_email) = v_email and claimed_by is null
  limit 1;

  if v_legacy_id is null then
    return jsonb_build_object('available', false, 'reports', 0, 'sightings', 0);
  end if;

  select count(*) into v_report_count
  from public.missing_dogs
  where legacy_owner_id = v_legacy_id and owner_id is null;

  select count(*) into v_sighting_count
  from public.sightings
  where legacy_owner_id = v_legacy_id and reporter_id is null;

  return jsonb_build_object(
    'available', (v_report_count + v_sighting_count) > 0,
    'reports', v_report_count,
    'sightings', v_sighting_count
  );
end;
$$;

revoke all on function public.check_legacy_pet_alert_reports() from public;
grant execute on function public.check_legacy_pet_alert_reports() to authenticated;

create or replace function public.claim_legacy_pet_alert_reports()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_email text;
  v_legacy_id uuid;
  v_report_count integer := 0;
  v_sighting_count integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'You must be logged in.'; end if;

  select lower(email) into v_email from auth.users where id = v_user_id;
  if v_email is null then raise exception 'Your account has no email address.'; end if;

  select legacy_user_id into v_legacy_id
  from public.legacy_account_map
  where lower(legacy_email) = v_email and claimed_by is null
  limit 1;

  if v_legacy_id is null then
    return jsonb_build_object('claimed', false, 'reports', 0, 'sightings', 0);
  end if;

  update public.missing_dogs
  set owner_id = v_user_id
  where legacy_owner_id = v_legacy_id and owner_id is null;
  get diagnostics v_report_count = row_count;

  update public.sightings
  set reporter_id = v_user_id
  where legacy_owner_id = v_legacy_id and reporter_id is null;
  get diagnostics v_sighting_count = row_count;

  update public.legacy_account_map
  set claimed_by = v_user_id, claimed_at = now()
  where legacy_user_id = v_legacy_id;

  return jsonb_build_object(
    'claimed', true,
    'reports', v_report_count,
    'sightings', v_sighting_count
  );
end;
$$;

revoke all on function public.claim_legacy_pet_alert_reports() from public;
grant execute on function public.claim_legacy_pet_alert_reports() to authenticated;
