-- PET ALERT PH - Cache Diagnostics v6.3
-- Run once in Supabase SQL Editor after deploying the v6.3 website files.
-- Purpose: record only Vercel photo-route executions (CDN did not serve the
-- response directly), then show whether Next.js Data Cache rescued the request
-- or Supabase origin had to be fetched again.

create table if not exists public.pet_alert_photo_route_execution_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  photo_path text not null,
  bytes bigint not null default 0 check (bytes >= 0),
  data_cache_hit boolean not null,
  origin_fetched_at timestamptz not null,
  vercel_region text,
  deployment_id text
);

alter table public.pet_alert_photo_route_execution_log enable row level security;

create index if not exists pet_alert_photo_route_execution_log_occurred_at_idx
  on public.pet_alert_photo_route_execution_log (occurred_at desc);

create index if not exists pet_alert_photo_route_execution_log_photo_path_idx
  on public.pet_alert_photo_route_execution_log (photo_path, occurred_at desc);

-- Service-role-only writer. Public/anon/authenticated clients cannot insert.
drop function if exists public.record_pet_alert_photo_route_execution(text,bigint,timestamptz,boolean,text,text);

create function public.record_pet_alert_photo_route_execution(
  p_path text,
  p_bytes bigint,
  p_origin_fetched_at timestamptz,
  p_data_cache_hit boolean,
  p_vercel_region text default null,
  p_deployment_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pet_alert_photo_route_execution_log (
    photo_path,
    bytes,
    data_cache_hit,
    origin_fetched_at,
    vercel_region,
    deployment_id
  ) values (
    left(coalesce(nullif(p_path, ''), '(unknown)'), 1024),
    greatest(coalesce(p_bytes, 0), 0),
    coalesce(p_data_cache_hit, false),
    coalesce(p_origin_fetched_at, now()),
    left(nullif(p_vercel_region, ''), 32),
    left(nullif(p_deployment_id, ''), 160)
  );
end;
$$;

revoke all on function public.record_pet_alert_photo_route_execution(text,bigint,timestamptz,boolean,text,text)
from public, anon, authenticated;
grant execute on function public.record_pet_alert_photo_route_execution(text,bigint,timestamptz,boolean,text,text)
to service_role;

-- Admin-only reader used by the Analytics tab.
drop function if exists public.get_pet_alert_photo_cache_diagnostics(date,date,integer);

create function public.get_pet_alert_photo_cache_diagnostics(
  p_from date,
  p_to date,
  p_limit integer default 100
)
returns table (
  occurred_at timestamptz,
  photo_path text,
  bytes bigint,
  data_cache_hit boolean,
  origin_fetched_at timestamptz,
  cache_age_seconds bigint,
  vercel_region text,
  deployment_id text
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
    l.data_cache_hit,
    l.origin_fetched_at,
    greatest(0, floor(extract(epoch from (l.occurred_at - l.origin_fetched_at)))::bigint),
    l.vercel_region,
    l.deployment_id
  from public.pet_alert_photo_route_execution_log l
  where (timezone('Asia/Manila', l.occurred_at))::date between p_from and p_to
  order by l.occurred_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

revoke all on function public.get_pet_alert_photo_cache_diagnostics(date,date,integer)
from public, anon;
grant execute on function public.get_pet_alert_photo_cache_diagnostics(date,date,integer)
to authenticated;
