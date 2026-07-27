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
