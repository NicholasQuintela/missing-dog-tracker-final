-- PET ALERT PH — FRESH ABUSE REPORT MECHANISM
-- Safe to run after earlier moderation migrations.

create extension if not exists pgcrypto;

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

create index if not exists abuse_reports_status_created_idx
  on public.abuse_reports(status, created_at desc);
create index if not exists abuse_reports_target_idx
  on public.abuse_reports(target_type, target_id);

alter table public.abuse_reports enable row level security;

-- Browser users cannot directly insert or alter moderation records.
drop policy if exists "Users create abuse reports" on public.abuse_reports;
drop policy if exists "Anyone creates abuse reports" on public.abuse_reports;

-- Keep existing admin/read policies. The server route writes using the service role.
notify pgrst, 'reload schema';
