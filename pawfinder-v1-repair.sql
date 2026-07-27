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
