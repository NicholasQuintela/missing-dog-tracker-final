-- PawFinder Auth + Notifications migration
-- Run AFTER your existing PawFinder setup.

create extension if not exists pgcrypto;

-- Link reports to the Supabase Auth account that created them.
alter table public.missing_dogs add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists missing_dogs_owner_id_idx on public.missing_dogs(owner_id);

-- Notifications are private to the recipient.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid references public.missing_dogs(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_dog_idx on public.notifications(dog_id);

alter table public.notifications enable row level security;

-- Notifications can only be read/marked read by their owner.
drop policy if exists "Users can view their notifications" on public.notifications;
create policy "Users can view their notifications"
on public.notifications for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can mark their notifications read" on public.notifications;
create policy "Users can mark their notifications read"
on public.notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- App clients must not create notifications directly; triggers do it safely.
drop policy if exists "No public notification inserts" on public.notifications;

-- Make report creation require a signed-in owner.
drop policy if exists "Anyone can report missing dogs" on public.missing_dogs;
drop policy if exists "Authenticated users can report missing dogs" on public.missing_dogs;
create policy "Authenticated users can report missing dogs"
on public.missing_dogs for insert to authenticated
with check (owner_id = auth.uid());

-- Existing public read policy is preserved/recreated for clarity.
drop policy if exists "Anyone can view missing dogs" on public.missing_dogs;
create policy "Anyone can view missing dogs"
on public.missing_dogs for select to anon, authenticated using (true);

-- Keep found-report updates available to authenticated users; the app's current
-- workflow allows a finder to mark a dog found without owning the report.
drop policy if exists "Anyone can mark dogs as found" on public.missing_dogs;
create policy "Anyone can mark dogs as found"
on public.missing_dogs for update to anon, authenticated
using (true)
with check (status in ('active', 'found'));

-- Secure trigger function: it inserts notifications without exposing INSERT to clients.
create or replace function public.create_pawfinder_notification(
  p_user_id uuid,
  p_dog_id uuid,
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
  insert into public.notifications(user_id, dog_id, type, title, message)
  values (p_user_id, p_dog_id, p_type, p_title, p_message);
end;
$$;

-- Notify the dog owner when someone joins the search.
create or replace function public.notify_pawfinder_volunteer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare owner uuid; dog_name text;
begin
  select owner_id, name into owner, dog_name from public.missing_dogs where id = new.dog_id;
  perform public.create_pawfinder_notification(
    owner, new.dog_id, 'volunteer',
    'Someone joined the search',
    coalesce(new.volunteer_name, 'A volunteer') || ' is helping look for ' || coalesce(dog_name, 'your dog') || '.'
  );
  return new;
end;
$$;

drop trigger if exists pawfinder_volunteer_notification on public.volunteers;
create trigger pawfinder_volunteer_notification
after insert on public.volunteers
for each row execute function public.notify_pawfinder_volunteer();

-- Notify the owner when a dog is marked found.
create or replace function public.notify_pawfinder_found()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'found' and (old.status is distinct from 'found') then
    perform public.create_pawfinder_notification(
      new.owner_id, new.id, 'found',
      'Your dog may have been found!',
      coalesce(new.name, 'Your dog') || ' was marked found by ' || coalesce(new.found_by, 'a finder') || '.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists pawfinder_found_notification on public.missing_dogs;
create trigger pawfinder_found_notification
after update of status on public.missing_dogs
for each row execute function public.notify_pawfinder_found();

-- Realtime notification delivery.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
