-- Pet Alert PH v1.1 security/admin migration
-- Run once AFTER the earlier complete database repair.
create extension if not exists pgcrypto;

-- 1) Admin roles and abuse reports
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','super_admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('missing_dog','sighting','user','conversation','message')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists abuse_reports_status_created_idx on public.abuse_reports(status,created_at desc);

create or replace function public.is_pet_alert_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.admins where user_id=p_user)
$$;
revoke all on function public.is_pet_alert_admin(uuid) from public, anon;
grant execute on function public.is_pet_alert_admin(uuid) to authenticated;

alter table public.admins enable row level security;
alter table public.abuse_reports enable row level security;
drop policy if exists "Admins can view admin roles" on public.admins;
create policy "Admins can view admin roles" on public.admins for select to authenticated using(public.is_pet_alert_admin());
drop policy if exists "Users can view own admin role" on public.admins;
create policy "Users can view own admin role" on public.admins for select to authenticated using(user_id=auth.uid());
drop policy if exists "Users can submit abuse reports" on public.abuse_reports;
create policy "Users can submit abuse reports" on public.abuse_reports for insert to authenticated with check(reporter_id=auth.uid());
drop policy if exists "Users can view own abuse reports" on public.abuse_reports;
create policy "Users can view own abuse reports" on public.abuse_reports for select to authenticated using(reporter_id=auth.uid() or public.is_pet_alert_admin());
drop policy if exists "Admins can update abuse reports" on public.abuse_reports;
create policy "Admins can update abuse reports" on public.abuse_reports for update to authenticated using(public.is_pet_alert_admin()) with check(public.is_pet_alert_admin());

-- 2) Tight report ownership. Remove broad update policies.
alter table public.missing_dogs enable row level security;
drop policy if exists "Authenticated users can mark dogs as found" on public.missing_dogs;
drop policy if exists "Anyone can mark dogs as found" on public.missing_dogs;
drop policy if exists "Owners can update reports" on public.missing_dogs;
create policy "Owners can update reports" on public.missing_dogs for update to authenticated
using(owner_id=auth.uid() or public.is_pet_alert_admin())
with check(owner_id=auth.uid() or public.is_pet_alert_admin());
drop policy if exists "Owners can delete reports" on public.missing_dogs;
create policy "Owners can delete reports" on public.missing_dogs for delete to authenticated
using(owner_id=auth.uid() or public.is_pet_alert_admin());

-- Secure RPC used by a finder. It changes only found fields, never report ownership/content.
create or replace function public.mark_pet_report_found(
  p_dog_id uuid,
  p_finder_name text,
  p_note text default null,
  p_photo_url text default null,
  p_photo_path text default null
) returns public.missing_dogs
language plpgsql security definer set search_path=public as $$
declare v_row public.missing_dogs;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.missing_dogs set
    status='found', found_by=left(trim(p_finder_name),120), found_by_user_id=auth.uid(),
    found_note=nullif(left(trim(coalesce(p_note,'')),1000),''), found_photo_url=p_photo_url,
    found_photo_path=p_photo_path, found_at=now()
  where id=p_dog_id and owner_id is distinct from auth.uid() and status='active'
  returning * into v_row;
  if v_row.id is null then raise exception 'Report is unavailable or you are its owner'; end if;
  return v_row;
end $$;
revoke all on function public.mark_pet_report_found(uuid,text,text,text,text) from public,anon;
grant execute on function public.mark_pet_report_found(uuid,text,text,text,text) to authenticated;

-- 3) Volunteer privacy: only involved users/admins can read full rows.
drop policy if exists "Anyone can view volunteers" on public.volunteers;
drop policy if exists "Participants can view volunteers" on public.volunteers;
create policy "Participants can view volunteers" on public.volunteers for select to authenticated using(
  user_id=auth.uid() or public.is_pet_alert_admin() or exists(
    select 1 from public.missing_dogs d where d.id=volunteers.dog_id and d.owner_id=auth.uid()
  )
);

-- Public-safe volunteer counts without exposing names/contact data.
create or replace function public.get_public_volunteer_counts()
returns table(dog_id uuid, volunteer_count bigint)
language sql stable security definer set search_path=public as $$
  select v.dog_id,count(*) from public.volunteers v group by v.dog_id
$$;
revoke all on function public.get_public_volunteer_counts() from public;
grant execute on function public.get_public_volunteer_counts() to anon,authenticated;

-- 4) Rate limiting in database (cannot be bypassed by calling REST directly).
create table if not exists public.action_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  action_count integer not null default 0,
  primary key(user_id,action,window_start)
);
alter table public.action_rate_limits enable row level security;

create or replace function public.enforce_action_rate_limit(p_action text,p_limit int,p_window interval)
returns void language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_start timestamptz; v_count int;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  v_start:=to_timestamp(floor(extract(epoch from now())/greatest(extract(epoch from p_window),1))*greatest(extract(epoch from p_window),1));
  insert into public.action_rate_limits(user_id,action,window_start,action_count)
  values(v_uid,p_action,v_start,1)
  on conflict(user_id,action,window_start) do update set action_count=public.action_rate_limits.action_count+1
  returning action_count into v_count;
  if v_count>p_limit then raise exception 'Too many actions. Please wait and try again.' using errcode='P0001'; end if;
end $$;
revoke all on function public.enforce_action_rate_limit(text,int,interval) from public,anon,authenticated;

create or replace function public.rate_limit_reports_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.enforce_action_rate_limit('report',5,interval '1 day'); return new; end $$;
create or replace function public.rate_limit_sightings_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.enforce_action_rate_limit('sighting',15,interval '1 day'); return new; end $$;
create or replace function public.rate_limit_messages_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.enforce_action_rate_limit('message',30,interval '1 minute'); return new; end $$;
create or replace function public.rate_limit_volunteers_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.enforce_action_rate_limit('volunteer',20,interval '1 day'); return new; end $$;
drop trigger if exists rate_limit_reports on public.missing_dogs; create trigger rate_limit_reports before insert on public.missing_dogs for each row execute function public.rate_limit_reports_trigger();
drop trigger if exists rate_limit_sightings on public.sightings; create trigger rate_limit_sightings before insert on public.sightings for each row execute function public.rate_limit_sightings_trigger();
drop trigger if exists rate_limit_messages on public.messages; create trigger rate_limit_messages before insert on public.messages for each row execute function public.rate_limit_messages_trigger();
drop trigger if exists rate_limit_volunteers on public.volunteers; create trigger rate_limit_volunteers before insert on public.volunteers for each row execute function public.rate_limit_volunteers_trigger();

-- 5) Lock trigger-only / maintenance functions from direct RPC access.
do $$ declare r record; begin
  for r in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'create_pawfinder_activity','ensure_pawfinder_conversation','pawfinder_after_volunteer',
      'notify_owner_about_sighting','notify_pawfinder_found','cleanup_pawfinder_activity',
      'queue_expired_pawfinder_photos','rate_limit_reports_trigger','rate_limit_sightings_trigger',
      'rate_limit_messages_trigger','rate_limit_volunteers_trigger','enforce_action_rate_limit'
    )
  loop execute format('revoke all on function %I.%I(%s) from public, anon, authenticated',r.nspname,r.proname,r.args); end loop;
end $$;

-- 6) Storage restrictions. Existing public reads remain; writes require signed-in user folder.
update storage.buckets set public=true,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='dog-photos';
drop policy if exists "Anyone can upload dog photos" on storage.objects;
drop policy if exists "Authenticated users upload own dog photos" on storage.objects;
create policy "Authenticated users upload own dog photos" on storage.objects for insert to authenticated with check(
  bucket_id='dog-photos' and (storage.foldername(name))[2]=auth.uid()::text
);
drop policy if exists "Users delete own dog photos" on storage.objects;
create policy "Users delete own dog photos" on storage.objects for delete to authenticated using(
  bucket_id='dog-photos' and ((storage.foldername(name))[2]=auth.uid()::text or public.is_pet_alert_admin())
);

-- Admin dashboard counts
create or replace function public.get_pet_alert_admin_stats()
returns jsonb language sql stable security definer set search_path=public as $$
 select case when public.is_pet_alert_admin() then jsonb_build_object(
  'users',(select count(*) from auth.users),
  'reports',(select count(*) from public.missing_dogs),
  'active_reports',(select count(*) from public.missing_dogs where status='active'),
  'sightings',(select count(*) from public.sightings),
  'conversations',(select count(*) from public.conversations),
  'pending_abuse',(select count(*) from public.abuse_reports where status='pending')
 ) else null end
$$;
revoke all on function public.get_pet_alert_admin_stats() from public,anon;
grant execute on function public.get_pet_alert_admin_stats() to authenticated;

notify pgrst,'reload schema';
