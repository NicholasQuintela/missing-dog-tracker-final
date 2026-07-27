-- ============================================================
-- PawFinder v1 COMPLETE database repair
-- Run this single file in Supabase SQL Editor.
-- It creates missing sightings/chat tables first, then applies
-- the volunteer, sighting, finder, notification, and chat repair.
-- Safe to re-run because the component migrations use IF NOT EXISTS
-- and DROP POLICY/TRIGGER IF EXISTS where appropriate.
-- ============================================================

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
      'New sighting reported', new.title || ' — possible sighting of ' || coalesce(v_name,'your dog'));
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
-- ============================================================
-- PawFinder Activity Center + Secure Volunteers + Private Chat
-- Run this ONCE in Supabase SQL Editor after the earlier auth setup.
-- It is written to be safe to re-run.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Secure volunteers: every volunteer is a signed-in account.
alter table public.volunteers add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists volunteers_user_id_idx on public.volunteers(user_id);

-- Remove duplicate account/report combinations before adding uniqueness.
delete from public.volunteers a
using public.volunteers b
where a.user_id is not null
  and a.user_id = b.user_id
  and a.dog_id = b.dog_id
  and a.created_at > b.created_at;

create unique index if not exists volunteers_one_account_per_dog_idx
on public.volunteers(dog_id, user_id)
where user_id is not null;

alter table public.volunteers enable row level security;

drop policy if exists "Anyone can volunteer" on public.volunteers;
drop policy if exists "Authenticated users can volunteer" on public.volunteers;
create policy "Authenticated users can volunteer"
on public.volunteers for insert to authenticated
with check (
  user_id = auth.uid()
  and not exists (
    select 1 from public.missing_dogs d
    where d.id = dog_id and d.owner_id = auth.uid()
  )
);

-- Public may see the search-party names already shown by the current app.
drop policy if exists "Anyone can view volunteers" on public.volunteers;
create policy "Anyone can view volunteers"
on public.volunteers for select to anon, authenticated
using (true);

-- 2) Private one-to-one conversations: owner + one volunteer.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.missing_dogs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  volunteer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (dog_id, volunteer_id),
  check (owner_id <> volunteer_id)
);

create index if not exists conversations_owner_idx on public.conversations(owner_id, last_message_at desc);
create index if not exists conversations_volunteer_idx on public.conversations(volunteer_id, last_message_at desc);

alter table public.conversations enable row level security;

drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations"
on public.conversations for select to authenticated
using (auth.uid() = owner_id or auth.uid() = volunteer_id);

-- Conversations are created only by a trusted trigger, not directly by browsers.

-- 3) Text-only messages. No attachments means chat uses almost no Storage bucket space.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages"
on public.messages for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.owner_id = auth.uid() or c.volunteer_id = auth.uid())
  )
);

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.owner_id = auth.uid() or c.volunteer_id = auth.uid())
  )
);

-- 4) Expand notifications into a complete activity feed.
alter table public.notifications add column if not exists actor_id uuid references auth.users(id) on delete set null;
alter table public.notifications add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
create index if not exists notifications_conversation_idx on public.notifications(conversation_id);

-- Keep notification clients from inserting arbitrary notifications.
alter table public.notifications enable row level security;
drop policy if exists "Users can view their notifications" on public.notifications;
create policy "Users can view their notifications"
on public.notifications for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can mark their notifications read" on public.notifications;
create policy "Users can mark their notifications read"
on public.notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- 5) Trusted helper with chat/activity references.
create or replace function public.create_pawfinder_activity(
  p_user_id uuid,
  p_actor_id uuid,
  p_dog_id uuid,
  p_conversation_id uuid,
  p_type text,
  p_title text,
  p_message text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications(user_id, actor_id, dog_id, conversation_id, type, title, message)
  values (p_user_id, p_actor_id, p_dog_id, p_conversation_id, p_type, left(p_title, 120), left(p_message, 300));
end;
$$;

-- 6) Volunteering automatically creates private chat and notifies the owner.
create or replace function public.pawfinder_after_volunteer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_dog_name text;
  v_conversation uuid;
begin
  if new.user_id is null then
    raise exception 'A signed-in account is required to volunteer';
  end if;

  select owner_id, name into v_owner, v_dog_name
  from public.missing_dogs where id = new.dog_id;

  if v_owner is null then
    raise exception 'This older report has no account owner';
  end if;
  if v_owner = new.user_id then
    raise exception 'Owners cannot volunteer on their own report';
  end if;

  insert into public.conversations(dog_id, owner_id, volunteer_id)
  values (new.dog_id, v_owner, new.user_id)
  on conflict (dog_id, volunteer_id)
  do update set last_message_at = public.conversations.last_message_at
  returning id into v_conversation;

  perform public.create_pawfinder_activity(
    v_owner, new.user_id, new.dog_id, v_conversation, 'volunteer',
    'Someone volunteered on your report',
    coalesce(new.volunteer_name, 'A verified user') || ' volunteered to help find ' || coalesce(v_dog_name, 'your dog') || '. Tap to open your private chat.'
  );

  return new;
end;
$$;

drop trigger if exists pawfinder_volunteer_notification on public.volunteers;
drop trigger if exists pawfinder_after_volunteer_trigger on public.volunteers;
create trigger pawfinder_after_volunteer_trigger
after insert on public.volunteers
for each row execute function public.pawfinder_after_volunteer();

-- 7) Each message creates a compact notification for the other participant.
create or replace function public.pawfinder_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_volunteer uuid;
  v_recipient uuid;
  v_dog uuid;
  v_dog_name text;
begin
  select c.owner_id, c.volunteer_id, c.dog_id, d.name
  into v_owner, v_volunteer, v_dog, v_dog_name
  from public.conversations c
  join public.missing_dogs d on d.id = c.dog_id
  where c.id = new.conversation_id;

  if new.sender_id = v_owner then v_recipient := v_volunteer;
  elsif new.sender_id = v_volunteer then v_recipient := v_owner;
  else raise exception 'Sender is not a conversation participant';
  end if;

  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;

  perform public.create_pawfinder_activity(
    v_recipient, new.sender_id, v_dog, new.conversation_id, 'message',
    'New message about ' || coalesce(v_dog_name, 'a dog'),
    left(new.body, 120)
  );
  return new;
end;
$$;

drop trigger if exists pawfinder_after_message_trigger on public.messages;
create trigger pawfinder_after_message_trigger
after insert on public.messages
for each row execute function public.pawfinder_after_message();

-- 8) Found update stays in the owner's activity feed.
create or replace function public.notify_pawfinder_found()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'found' and old.status is distinct from 'found' then
    perform public.create_pawfinder_activity(
      new.owner_id, auth.uid(), new.id, null, 'found',
      'Your dog may have been found!',
      coalesce(new.name, 'Your dog') || ' was marked found by ' || coalesce(new.found_by, 'a verified user') || '.'
    );
  end if;
  return new;
end;
$$;

-- Marking found now requires authentication.
drop policy if exists "Anyone can mark dogs as found" on public.missing_dogs;
drop policy if exists "Authenticated users can mark dogs as found" on public.missing_dogs;
create policy "Authenticated users can mark dogs as found"
on public.missing_dogs for update to authenticated
using (true)
with check (status in ('active', 'found'));

-- 9) Realtime tables.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- 10) Lightweight cleanup function. Schedule weekly in Supabase Cron if desired.
-- Read activity older than 90 days is removed. Chat text is retained for one year
-- after a report is found. No chat files are stored in Storage.
create or replace function public.cleanup_pawfinder_activity()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where read_at is not null and created_at < now() - interval '90 days';

  delete from public.messages m
  using public.conversations c, public.missing_dogs d
  where m.conversation_id = c.id
    and c.dog_id = d.id
    and d.status = 'found'
    and coalesce(d.found_at, d.created_at) < now() - interval '1 year';
end;
$$;
-- PawFinder v1 repair: volunteers, sightings, found reports, private chat
-- Run this once in Supabase SQL Editor. Safe to re-run.
create extension if not exists pgcrypto;

-- Required actor columns
alter table public.volunteers add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.missing_dogs add column if not exists found_by_user_id uuid references auth.users(id) on delete set null;
alter table public.sightings add column if not exists reporter_id uuid references auth.users(id) on delete cascade;

create index if not exists volunteers_user_id_idx on public.volunteers(user_id);
create unique index if not exists volunteers_one_account_per_dog_idx on public.volunteers(dog_id,user_id) where user_id is not null;

-- Generalize existing conversations: volunteer_id is the private counterpart account.
alter table public.conversations add column if not exists source_type text not null default 'volunteer';
alter table public.conversations add column if not exists source_id uuid;
alter table public.conversations drop constraint if exists conversations_source_type_check;
alter table public.conversations add constraint conversations_source_type_check check (source_type in ('volunteer','sighting','found'));

-- Keep one private conversation per report and counterpart. It can be reused by volunteer/sighting/found actions.
create unique index if not exists conversations_dog_counterpart_idx on public.conversations(dog_id,volunteer_id);

-- RLS: signed-in actors only.
alter table public.volunteers enable row level security;
drop policy if exists "Anyone can volunteer" on public.volunteers;
drop policy if exists "Authenticated users can volunteer" on public.volunteers;
create policy "Authenticated users can volunteer" on public.volunteers for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.missing_dogs d where d.id=dog_id and d.owner_id is not null and d.owner_id<>auth.uid())
);

drop policy if exists "Anyone can view volunteers" on public.volunteers;
create policy "Anyone can view volunteers" on public.volunteers for select to anon,authenticated using(true);

alter table public.sightings enable row level security;
drop policy if exists "Authenticated users can create sightings" on public.sightings;
create policy "Authenticated users can create sightings" on public.sightings for insert to authenticated
with check (reporter_id=auth.uid());

-- Found updates are allowed only for signed-in users and must identify the actor.
drop policy if exists "Anyone can mark dogs as found" on public.missing_dogs;
drop policy if exists "Authenticated users can mark dogs as found" on public.missing_dogs;
create policy "Authenticated users can mark dogs as found" on public.missing_dogs for update to authenticated
using (true)
with check (
  status in ('active','found')
  and (status <> 'found' or found_by_user_id = auth.uid() or owner_id = auth.uid())
);

-- Creates/reuses a private chat and returns its id.
create or replace function public.ensure_pawfinder_conversation(
  p_dog_id uuid,
  p_counterpart_id uuid,
  p_source_type text,
  p_source_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_id uuid;
begin
  select owner_id into v_owner from public.missing_dogs where id=p_dog_id;
  if v_owner is null then raise exception 'This report is not linked to an owner account'; end if;
  if p_counterpart_id is null then raise exception 'A signed-in account is required'; end if;
  if v_owner=p_counterpart_id then raise exception 'The owner cannot create this interaction on their own report'; end if;

  insert into public.conversations(dog_id,owner_id,volunteer_id,source_type,source_id)
  values(p_dog_id,v_owner,p_counterpart_id,p_source_type,p_source_id)
  on conflict (dog_id,volunteer_id) do update
    set source_type=excluded.source_type,
        source_id=coalesce(excluded.source_id,public.conversations.source_id),
        last_message_at=greatest(public.conversations.last_message_at,now())
  returning id into v_id;
  return v_id;
end $$;

-- Volunteer -> chat + notifications for both accounts.
create or replace function public.pawfinder_after_volunteer()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_name text; v_chat uuid;
begin
  if new.user_id is null then raise exception 'A signed-in account is required to volunteer'; end if;
  select owner_id,name into v_owner,v_name from public.missing_dogs where id=new.dog_id;
  v_chat := public.ensure_pawfinder_conversation(new.dog_id,new.user_id,'volunteer',new.id);
  perform public.create_pawfinder_activity(v_owner,new.user_id,new.dog_id,v_chat,'volunteer',
    'Someone volunteered on your report',coalesce(new.volunteer_name,'A verified user')||' volunteered to help find '||coalesce(v_name,'your dog')||'. Tap to chat.');
  perform public.create_pawfinder_activity(new.user_id,v_owner,new.dog_id,v_chat,'volunteer',
    'You joined the search for '||coalesce(v_name,'a dog'),'Your private chat with the owner is ready.');
  return new;
end $$;
drop trigger if exists pawfinder_after_volunteer_trigger on public.volunteers;
drop trigger if exists pawfinder_volunteer_notification on public.volunteers;
create trigger pawfinder_after_volunteer_trigger after insert on public.volunteers for each row execute function public.pawfinder_after_volunteer();

-- Sighting -> chat + notifications when linked to a report.
create or replace function public.notify_owner_about_sighting()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_name text; v_chat uuid;
begin
  if new.dog_id is null then return new; end if;
  select owner_id,name into v_owner,v_name from public.missing_dogs where id=new.dog_id;
  if v_owner is null or v_owner=new.reporter_id then return new; end if;
  v_chat := public.ensure_pawfinder_conversation(new.dog_id,new.reporter_id,'sighting',new.id);
  perform public.create_pawfinder_activity(v_owner,new.reporter_id,new.dog_id,v_chat,'sighting',
    'New sighting reported',new.title||' — possible sighting of '||coalesce(v_name,'your dog')||'. Tap to chat with the reporter.');
  perform public.create_pawfinder_activity(new.reporter_id,v_owner,new.dog_id,v_chat,'sighting',
    'Sighting sent to the owner','Your private chat about '||coalesce(v_name,'the dog')||' is ready.');
  return new;
end $$;
drop trigger if exists notify_owner_about_sighting_trigger on public.sightings;
create trigger notify_owner_about_sighting_trigger after insert on public.sightings for each row execute function public.notify_owner_about_sighting();

-- Found -> chat + notifications for owner and finder.
create or replace function public.notify_pawfinder_found()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_chat uuid;
begin
  if new.status='found' and old.status is distinct from 'found' then
    if new.found_by_user_id is null then raise exception 'A signed-in finder account is required'; end if;
    if new.owner_id is not null and new.owner_id<>new.found_by_user_id then
      v_chat := public.ensure_pawfinder_conversation(new.id,new.found_by_user_id,'found',new.id);
      perform public.create_pawfinder_activity(new.owner_id,new.found_by_user_id,new.id,v_chat,'found',
        'Your dog may have been found!',coalesce(new.name,'Your dog')||' was marked found by '||coalesce(new.found_by,'a verified user')||'. Tap to chat.');
      perform public.create_pawfinder_activity(new.found_by_user_id,new.owner_id,new.id,v_chat,'found',
        'You reported '||coalesce(new.name,'a dog')||' found','Your private chat with the owner is ready.');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists pawfinder_found_notification on public.missing_dogs;
drop trigger if exists notify_pawfinder_found_trigger on public.missing_dogs;
create trigger notify_pawfinder_found_trigger after update on public.missing_dogs for each row execute function public.notify_pawfinder_found();

-- Helper RPC lets clients retrieve the chat created by a trigger.
create or replace function public.get_my_case_conversation(p_dog_id uuid)
returns uuid language sql security definer set search_path=public stable as $$
  select id from public.conversations
  where dog_id=p_dog_id and (owner_id=auth.uid() or volunteer_id=auth.uid())
  order by last_message_at desc limit 1
$$;
grant execute on function public.get_my_case_conversation(uuid) to authenticated;

-- Realtime publications.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sightings') then alter publication supabase_realtime add table public.sightings; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
end $$;

notify pgrst,'reload schema';
