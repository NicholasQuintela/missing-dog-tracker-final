-- PawFinder: sightings, delete controls, shareable records, and photo cleanup queue
-- Run AFTER the earlier auth/activity/chat SQL. Safe to re-run.

create extension if not exists pgcrypto;

alter table public.missing_dogs add column if not exists photo_path text;
alter table public.missing_dogs add column if not exists found_photo_path text;

create table if not exists public.sightings (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid references public.missing_dogs(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text check (description is null or char_length(description) <= 2000),
  photo_url text,
  photo_path text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  seen_at timestamptz not null default now(),
  contact_info text,
  status text not null default 'active' check (status in ('active','resolved')),
  created_at timestamptz not null default now()
);

create index if not exists sightings_dog_idx on public.sightings(dog_id, created_at desc);
create index if not exists sightings_reporter_idx on public.sightings(reporter_id, created_at desc);
create index if not exists sightings_seen_idx on public.sightings(seen_at desc);
alter table public.sightings enable row level security;

drop policy if exists "Anyone can view active sightings" on public.sightings;
create policy "Anyone can view active sightings" on public.sightings
for select to anon, authenticated using (status = 'active' or reporter_id = auth.uid());

drop policy if exists "Authenticated users can create sightings" on public.sightings;
create policy "Authenticated users can create sightings" on public.sightings
for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists "Users can update own sightings" on public.sightings;
create policy "Users can update own sightings" on public.sightings
for update to authenticated using (reporter_id = auth.uid()) with check (reporter_id = auth.uid());

drop policy if exists "Users can delete own sightings" on public.sightings;
create policy "Users can delete own sightings" on public.sightings
for delete to authenticated using (reporter_id = auth.uid());

-- Owners can delete their own missing-dog reports.
drop policy if exists "Owners can delete own reports" on public.missing_dogs;
create policy "Owners can delete own reports" on public.missing_dogs
for delete to authenticated using (owner_id = auth.uid());

-- Queue file paths before rows are deleted. A small Edge Function removes the actual Storage objects.
create table if not exists public.photo_cleanup_queue (
  id bigint generated always as identity primary key,
  bucket_id text not null default 'dog-photos',
  object_path text not null,
  reason text not null,
  queued_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  unique(bucket_id, object_path)
);
alter table public.photo_cleanup_queue enable row level security;
-- No browser policies: only service-role/Edge Function may read or update this table.

create or replace function public.queue_dog_photos_for_cleanup()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.photo_path is not null then
    insert into public.photo_cleanup_queue(object_path, reason) values(old.photo_path, 'report_deleted') on conflict do nothing;
  end if;
  if old.found_photo_path is not null then
    insert into public.photo_cleanup_queue(object_path, reason) values(old.found_photo_path, 'report_deleted') on conflict do nothing;
  end if;
  return old;
end $$;

drop trigger if exists queue_dog_photos_before_delete on public.missing_dogs;
create trigger queue_dog_photos_before_delete before delete on public.missing_dogs
for each row execute function public.queue_dog_photos_for_cleanup();

create or replace function public.queue_sighting_photo_for_cleanup()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.photo_path is not null then
    insert into public.photo_cleanup_queue(object_path, reason) values(old.photo_path, 'sighting_deleted') on conflict do nothing;
  end if;
  return old;
end $$;

drop trigger if exists queue_sighting_photo_before_delete on public.sightings;
create trigger queue_sighting_photo_before_delete before delete on public.sightings
for each row execute function public.queue_sighting_photo_for_cleanup();

-- Optional retention rule: queue found-report photos after 180 days and sighting photos after 180 days.
-- The report/sighting text remains; only its image is removed after the Edge Function processes the queue.
create or replace function public.queue_expired_pawfinder_photos()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer := 0; v_rows integer := 0;
begin
  insert into public.photo_cleanup_queue(object_path, reason)
  select photo_path, 'found_report_photo_expired' from public.missing_dogs
  where status='found' and photo_path is not null and coalesce(found_at, created_at) < now() - interval '180 days'
  on conflict do nothing;
  get diagnostics v_count = row_count;

  insert into public.photo_cleanup_queue(object_path, reason)
  select found_photo_path, 'found_proof_photo_expired' from public.missing_dogs
  where status='found' and found_photo_path is not null and coalesce(found_at, created_at) < now() - interval '180 days'
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.photo_cleanup_queue(object_path, reason)
  select photo_path, 'sighting_photo_expired' from public.sightings
  where photo_path is not null and created_at < now() - interval '180 days'
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;
  return v_count;
end $$;

-- Notification for a sighting linked to a report.
create or replace function public.notify_owner_about_sighting()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_name text;
begin
  if new.dog_id is null then return new; end if;
  select owner_id, name into v_owner, v_name from public.missing_dogs where id=new.dog_id;
  if v_owner is not null and v_owner <> new.reporter_id then
    perform public.create_pawfinder_activity(v_owner,new.reporter_id,new.dog_id,null,'sighting',
      'New sighting reported', new.title || ' — possible sighting of ' || coalesce(v_name,'your pet'));
  end if;
  return new;
end $$;

drop trigger if exists notify_owner_about_sighting_trigger on public.sightings;
create trigger notify_owner_about_sighting_trigger after insert on public.sightings
for each row execute function public.notify_owner_about_sighting();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sightings') then
    alter publication supabase_realtime add table public.sightings;
  end if;
end $$;
