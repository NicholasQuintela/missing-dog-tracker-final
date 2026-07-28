-- Pet Alert PH: Bug reporting and moderator-panel integration
-- Run once in Supabase SQL Editor.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  title text not null,
  description text not null,
  steps_to_reproduce text,
  device text,
  browser text,
  user_agent text,
  screen_size text,
  page_url text,
  app_version text,
  status text not null default 'new' check (status in ('new','investigating','fixed','closed')),
  moderator_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bug_reports enable row level security;

-- Unique helper name avoids conflicts with helpers from older updates.
create or replace function public.pet_alert_bug_report_current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admins
    where user_id = auth.uid()
      and role in ('admin','super_admin')
  );
$$;

revoke all on function public.pet_alert_bug_report_current_user_is_admin() from public;
grant execute on function public.pet_alert_bug_report_current_user_is_admin() to authenticated;

-- Anyone may submit a bug after the website verifies CAPTCHA.
drop policy if exists "Anyone can submit bug reports" on public.bug_reports;
create policy "Anyone can submit bug reports"
on public.bug_reports for insert
to anon, authenticated
with check (
  char_length(title) between 4 and 120
  and char_length(description) between 10 and 2000
  and (user_id is null or user_id = auth.uid())
);

-- Only admins can see all bug reports.
drop policy if exists "Admins can view bug reports" on public.bug_reports;
create policy "Admins can view bug reports"
on public.bug_reports for select
to authenticated
using (public.pet_alert_bug_report_current_user_is_admin());

-- Only admins can update status and notes.
drop policy if exists "Admins can update bug reports" on public.bug_reports;
create policy "Admins can update bug reports"
on public.bug_reports for update
to authenticated
using (public.pet_alert_bug_report_current_user_is_admin())
with check (public.pet_alert_bug_report_current_user_is_admin());

create index if not exists bug_reports_status_created_at_idx
on public.bug_reports(status, created_at desc);

notify pgrst, 'reload schema';
