-- Pet Alert PH Egress Investigation Analytics v2
-- Run AFTER pet-alert-ph-private-visitor-analytics.sql.
-- Records only Vercel -> Supabase photo-origin misses (count + exact bytes).
-- Normal visitors never read this table. Admin reads aggregated daily totals only.

create table if not exists public.pet_alert_egress_origin_daily (
  metric_date date primary key,
  photo_origin_fetches bigint not null default 0,
  photo_origin_bytes bigint not null default 0,
  photo_origin_errors bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.pet_alert_egress_origin_daily enable row level security;

-- Called server-side by Vercel using SUPABASE_SERVICE_ROLE_KEY.
create or replace function public.record_pet_alert_photo_origin_fetch(
  p_bytes bigint,
  p_ok boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pet_alert_egress_origin_daily (
    metric_date,
    photo_origin_fetches,
    photo_origin_bytes,
    photo_origin_errors,
    updated_at
  ) values (
    (timezone('Asia/Manila', now()))::date,
    1,
    greatest(coalesce(p_bytes, 0), 0),
    case when p_ok then 0 else 1 end,
    now()
  )
  on conflict (metric_date) do update set
    photo_origin_fetches = public.pet_alert_egress_origin_daily.photo_origin_fetches + 1,
    photo_origin_bytes = public.pet_alert_egress_origin_daily.photo_origin_bytes + greatest(coalesce(excluded.photo_origin_bytes, 0), 0),
    photo_origin_errors = public.pet_alert_egress_origin_daily.photo_origin_errors + excluded.photo_origin_errors,
    updated_at = now();
end;
$$;

revoke all on function public.record_pet_alert_photo_origin_fetch(bigint, boolean) from public, anon, authenticated;
grant execute on function public.record_pet_alert_photo_origin_fetch(bigint, boolean) to service_role;

-- Admin-only combined daily dashboard.
create or replace function public.get_pet_alert_egress_analytics(
  p_from date,
  p_to date
)
returns table (
  metric_date date,
  unique_visitors bigint,
  photo_origin_fetches bigint,
  photo_origin_bytes bigint,
  photo_origin_errors bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.get_my_pet_alert_admin_role() is null then
    raise exception 'Access denied';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid date range';
  end if;

  if (p_to - p_from) > 366 then
    raise exception 'Date range is limited to 366 days';
  end if;

  return query
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ), visitors as (
    select v.visit_date d, count(*)::bigint n
    from public.pet_alert_daily_visitors v
    where v.visit_date between p_from and p_to
    group by v.visit_date
  )
  select
    days.d,
    coalesce(visitors.n, 0)::bigint,
    coalesce(e.photo_origin_fetches, 0)::bigint,
    coalesce(e.photo_origin_bytes, 0)::bigint,
    coalesce(e.photo_origin_errors, 0)::bigint
  from days
  left join visitors on visitors.d = days.d
  left join public.pet_alert_egress_origin_daily e on e.metric_date = days.d
  order by days.d desc;
end;
$$;

revoke all on function public.get_pet_alert_egress_analytics(date, date) from public, anon;
grant execute on function public.get_pet_alert_egress_analytics(date, date) to authenticated;
