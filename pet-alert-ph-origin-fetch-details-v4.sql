-- PET ALERT PH - Origin Fetch Details Analytics v4
-- Run AFTER the existing visitor/activity analytics setup.
-- Adds per-origin object/time/bytes diagnostics without logging CDN HITs.

create table if not exists public.pet_alert_photo_origin_fetch_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  photo_path text not null,
  bytes bigint not null default 0 check (bytes >= 0),
  ok boolean not null default true
);

alter table public.pet_alert_photo_origin_fetch_log enable row level security;

create index if not exists pet_alert_photo_origin_fetch_log_occurred_at_idx
  on public.pet_alert_photo_origin_fetch_log (occurred_at desc);

-- Replace the old 2-argument origin logger with the detailed 3-argument version.
-- This drops only the function definition; it does NOT delete analytics data.
drop function if exists public.record_pet_alert_photo_origin_fetch(bigint, boolean);
drop function if exists public.record_pet_alert_photo_origin_fetch(text, bigint, boolean);

create function public.record_pet_alert_photo_origin_fetch(
  p_path text,
  p_bytes bigint,
  p_ok boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_path text;
  safe_bytes bigint;
begin
  safe_path := left(coalesce(nullif(p_path, ''), '(unknown)'), 1024);
  safe_bytes := greatest(coalesce(p_bytes, 0), 0);

  -- One row only for a genuine Vercel photo-route origin execution.
  insert into public.pet_alert_photo_origin_fetch_log (
    occurred_at,
    photo_path,
    bytes,
    ok
  ) values (
    now(),
    safe_path,
    case when p_ok then safe_bytes else 0 end,
    p_ok
  );

  -- Keep the existing small daily aggregate for the dashboard cards.
  insert into public.pet_alert_egress_origin_daily (
    metric_date,
    photo_origin_fetches,
    photo_origin_bytes,
    photo_origin_errors,
    updated_at
  ) values (
    (timezone('Asia/Manila', now()))::date,
    1,
    case when p_ok then safe_bytes else 0 end,
    case when p_ok then 0 else 1 end,
    now()
  )
  on conflict (metric_date)
  do update set
    photo_origin_fetches = public.pet_alert_egress_origin_daily.photo_origin_fetches + 1,
    photo_origin_bytes = public.pet_alert_egress_origin_daily.photo_origin_bytes + case when p_ok then safe_bytes else 0 end,
    photo_origin_errors = public.pet_alert_egress_origin_daily.photo_origin_errors + case when p_ok then 0 else 1 end,
    updated_at = now();
end;
$$;

revoke all on function public.record_pet_alert_photo_origin_fetch(text, bigint, boolean)
from public, anon, authenticated;
grant execute on function public.record_pet_alert_photo_origin_fetch(text, bigint, boolean)
to service_role;

-- Admin-only detail reader. Returns at most 100 rows by default.
drop function if exists public.get_pet_alert_origin_fetch_details(date, date, integer);

create function public.get_pet_alert_origin_fetch_details(
  p_from date,
  p_to date,
  p_limit integer default 100
)
returns table (
  occurred_at timestamptz,
  photo_path text,
  bytes bigint,
  ok boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or public.get_my_pet_alert_admin_role() is null then
    raise exception 'Access denied';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid date range';
  end if;

  if (p_to - p_from) > 366 then
    raise exception 'Date range is limited to 366 days';
  end if;

  return query
  select
    l.occurred_at,
    l.photo_path,
    l.bytes,
    l.ok
  from public.pet_alert_photo_origin_fetch_log l
  where (timezone('Asia/Manila', l.occurred_at))::date between p_from and p_to
  order by l.occurred_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

revoke all on function public.get_pet_alert_origin_fetch_details(date, date, integer)
from public, anon;
grant execute on function public.get_pet_alert_origin_fetch_details(date, date, integer)
to authenticated;
