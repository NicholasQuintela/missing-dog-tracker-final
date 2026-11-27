-- Pet Alert PH: editable What's New announcement
-- Run once in the Supabase SQL Editor.
create table if not exists public.app_announcements (
  id text primary key,
  title text not null default 'What’s New',
  body text not null default '',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.app_announcements enable row level security;

drop policy if exists "Anyone can read enabled announcements" on public.app_announcements;
create policy "Anyone can read enabled announcements"
on public.app_announcements for select
to anon, authenticated
using (enabled = true);

drop policy if exists "Pet Alert admins can manage announcements" on public.app_announcements;
create policy "Pet Alert admins can manage announcements"
on public.app_announcements for all
to authenticated
using (public.get_my_pet_alert_admin_role() is not null)
with check (public.get_my_pet_alert_admin_role() is not null);

insert into public.app_announcements (id, title, body, enabled)
values ('whats-new', 'What’s New', 'Pet Alert PH updates and improvements will appear here.', true)
on conflict (id) do nothing;
