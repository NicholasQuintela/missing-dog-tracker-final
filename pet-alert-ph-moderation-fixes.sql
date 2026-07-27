-- ============================================================
-- PET ALERT PH — MODERATION & BUG FIX UPDATE
-- Run once in Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- Ensure moderation tables exist and can store all required targets.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','super_admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'pending',
  moderation_notes text,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.abuse_reports add column if not exists moderation_notes text;
alter table public.abuse_reports add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.abuse_reports add column if not exists moderated_at timestamptz;

-- Replace older check constraints with the current accepted values.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='public.abuse_reports'::regclass and contype='c'
  loop
    execute format('alter table public.abuse_reports drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.abuse_reports
  add constraint abuse_reports_target_type_check
  check (target_type in ('missing_dog','sighting','message','user'));
alter table public.abuse_reports
  add constraint abuse_reports_status_check
  check (status in ('pending','reviewing','resolved','dismissed'));
alter table public.abuse_reports
  add constraint abuse_reports_reason_length_check
  check (length(trim(reason)) between 3 and 100);

create index if not exists abuse_reports_status_created_idx on public.abuse_reports(status, created_at desc);
create index if not exists abuse_reports_target_idx on public.abuse_reports(target_type, target_id);

-- A uniquely named, non-recursive admin helper.
create or replace function public.pet_alert_is_admin_moderation_v4()
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(select 1 from public.admins where user_id=auth.uid());
$$;
revoke all on function public.pet_alert_is_admin_moderation_v4() from public, anon;
grant execute on function public.pet_alert_is_admin_moderation_v4() to authenticated;

create or replace function public.get_my_pet_alert_admin_role()
returns text
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select role from public.admins where user_id=auth.uid();
$$;
revoke all on function public.get_my_pet_alert_admin_role() from public, anon;
grant execute on function public.get_my_pet_alert_admin_role() to authenticated;

-- Ensure Nicholas is the super admin when that account exists.
insert into public.admins(user_id,role)
select id,'super_admin' from auth.users
where lower(email)=lower('quintelanicholas3@gmail.com')
on conflict(user_id) do update set role='super_admin';

alter table public.admins enable row level security;
alter table public.abuse_reports enable row level security;

-- Remove recursive or older policies and recreate safe policies.
drop policy if exists "Admins can view admins" on public.admins;
create policy "Admins can view admins" on public.admins
for select to authenticated using(public.pet_alert_is_admin_moderation_v4());

drop policy if exists "Users create abuse reports" on public.abuse_reports;
drop policy if exists "Users view own abuse reports" on public.abuse_reports;
drop policy if exists "Admins update abuse reports" on public.abuse_reports;
drop policy if exists "Admins delete abuse reports" on public.abuse_reports;

create policy "Users view own abuse reports" on public.abuse_reports
for select to authenticated
using(reporter_id=auth.uid() or public.pet_alert_is_admin_moderation_v4());

create policy "Admins update abuse reports" on public.abuse_reports
for update to authenticated
using(public.pet_alert_is_admin_moderation_v4())
with check(public.pet_alert_is_admin_moderation_v4());

-- Use an RPC instead of direct inserts so old/mismatched client payloads cannot cause 400 errors.
create or replace function public.submit_pet_alert_abuse_report(
  p_target_type text,
  p_target_id uuid,
  p_category text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be logged in.'; end if;
  if p_target_type not in ('missing_dog','sighting','message','user') then raise exception 'Invalid report target.'; end if;
  if p_category not in ('fake_report','spam','scam','harassment','inappropriate','other') then raise exception 'Invalid report reason.'; end if;
  if p_details is not null and length(p_details)>1000 then raise exception 'Details are too long.'; end if;

  -- Confirm the target exists and is visible to the reporting user where applicable.
  if p_target_type='missing_dog' and not exists(select 1 from public.missing_dogs where id=p_target_id) then raise exception 'Report not found.'; end if;
  if p_target_type='sighting' and not exists(select 1 from public.sightings where id=p_target_id) then raise exception 'Sighting not found.'; end if;
  if p_target_type='message' and not exists(
    select 1 from public.messages m
    join public.conversations c on c.id=m.conversation_id
    where m.id=p_target_id and auth.uid() in (c.owner_id,c.volunteer_id)
  ) then raise exception 'Message not found or access denied.'; end if;

  insert into public.abuse_reports(reporter_id,target_type,target_id,reason,details)
  values(auth.uid(),p_target_type,p_target_id,p_category,nullif(trim(p_details),''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_pet_alert_abuse_report(text,uuid,text,text) from public,anon;
grant execute on function public.submit_pet_alert_abuse_report(text,uuid,text,text) to authenticated;

-- Admin moderation action: remove content or dismiss the complaint.
create or replace function public.moderate_pet_alert_abuse_report(
  p_report_id uuid,
  p_action text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_item public.abuse_reports%rowtype;
begin
  if not public.pet_alert_is_admin_moderation_v4() then raise exception 'Admin access required.'; end if;
  if p_action not in ('remove','ignore') then raise exception 'Invalid moderation action.'; end if;
  select * into v_item from public.abuse_reports where id=p_report_id for update;
  if not found then raise exception 'Abuse report not found.'; end if;

  if p_action='remove' then
    if v_item.target_type='missing_dog' then delete from public.missing_dogs where id=v_item.target_id;
    elsif v_item.target_type='sighting' then delete from public.sightings where id=v_item.target_id;
    elsif v_item.target_type='message' then update public.messages set body='[Message removed by a Pet Alert PH moderator]' where id=v_item.target_id;
    end if;
    update public.abuse_reports set status='resolved',moderation_notes=nullif(trim(p_notes),''),moderated_by=auth.uid(),moderated_at=now() where id=p_report_id;
  else
    update public.abuse_reports set status='dismissed',moderation_notes=nullif(trim(p_notes),''),moderated_by=auth.uid(),moderated_at=now() where id=p_report_id;
  end if;
end $$;
revoke all on function public.moderate_pet_alert_abuse_report(uuid,text,text) from public,anon;
grant execute on function public.moderate_pet_alert_abuse_report(uuid,text,text) to authenticated;

-- Dashboard statistics, including sightings.
create or replace function public.get_pet_alert_admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare result jsonb;
begin
  if not public.pet_alert_is_admin_moderation_v4() then raise exception 'Admin access required.'; end if;
  select jsonb_build_object(
    'users',(select count(*) from auth.users),
    'reports',(select count(*) from public.missing_dogs),
    'active_reports',(select count(*) from public.missing_dogs where status='active'),
    'solved_reports',(select count(*) from public.missing_dogs where status='found'),
    'sightings',(select count(*) from public.sightings),
    'volunteers',(select count(*) from public.volunteers),
    'pending_abuse',(select count(*) from public.abuse_reports where status='pending')
  ) into result;
  return result;
end $$;
revoke all on function public.get_pet_alert_admin_stats() from public,anon;
grant execute on function public.get_pet_alert_admin_stats() to authenticated;

-- Delete notifications about solved/found cases after 24 hours.
create or replace function public.cleanup_solved_pet_alert_notifications()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare deleted_count integer;
begin
  delete from public.notifications n
  using public.missing_dogs d
  where n.dog_id=d.id
    and d.status='found'
    and coalesce(d.found_at,d.created_at)<now()-interval '24 hours'
    and (n.type in ('found','found_confirmed','report_found') or n.title ilike '%found%' or n.title ilike '%reunited%');
  get diagnostics deleted_count=row_count;
  return deleted_count;
end $$;
revoke all on function public.cleanup_solved_pet_alert_notifications() from public,anon,authenticated;

-- Schedule hourly cleanup when pg_cron is available. Failure to schedule will not abort the migration.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron could not be enabled automatically. Schedule cleanup_solved_pet_alert_notifications manually in Supabase Cron.';
  end;
  if exists(select 1 from pg_namespace where nspname='cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='pet-alert-clean-solved-notifications';
    perform cron.schedule('pet-alert-clean-solved-notifications','17 * * * *','select public.cleanup_solved_pet_alert_notifications();');
  end if;
exception when others then
  raise notice 'Cron scheduling skipped: %',sqlerrm;
end $$;

notify pgrst,'reload schema';
