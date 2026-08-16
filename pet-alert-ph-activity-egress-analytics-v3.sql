-- PET ALERT PH - Activity + Egress Analytics v3
-- Copy/paste into Supabase SQL Editor. Keeps existing visitor and origin data.

create table if not exists public.pet_alert_activity_daily (
  metric_date date primary key,
  page_loads bigint not null default 0,
  sessions bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.pet_alert_activity_daily enable row level security;

drop function if exists public.record_pet_alert_activity(uuid, boolean);
create function public.record_pet_alert_activity(p_visitor_id uuid, p_new_session boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_visitor_id is null then return; end if;
  insert into public.pet_alert_daily_visitors (visit_date, visitor_id)
  values ((timezone('Asia/Manila', now()))::date, p_visitor_id)
  on conflict (visit_date, visitor_id) do nothing;

  insert into public.pet_alert_activity_daily(metric_date, page_loads, sessions, updated_at)
  values ((timezone('Asia/Manila', now()))::date, 1, case when p_new_session then 1 else 0 end, now())
  on conflict (metric_date) do update set
    page_loads = public.pet_alert_activity_daily.page_loads + 1,
    sessions = public.pet_alert_activity_daily.sessions + case when p_new_session then 1 else 0 end,
    updated_at = now();
end; $$;
revoke all on function public.record_pet_alert_activity(uuid, boolean) from public;
grant execute on function public.record_pet_alert_activity(uuid, boolean) to anon, authenticated;

-- Return shape changed, so PostgreSQL requires dropping only this function definition.
-- This does NOT delete any analytics data.
drop function if exists public.get_pet_alert_egress_analytics(date, date);
create function public.get_pet_alert_egress_analytics(p_from date, p_to date)
returns table (
  metric_date date, unique_visitors bigint, page_loads bigint, sessions bigint,
  photo_origin_fetches bigint, photo_origin_bytes bigint, photo_origin_errors bigint
) language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.get_my_pet_alert_admin_role() is null then raise exception 'Access denied'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Invalid date range'; end if;
  if (p_to - p_from) > 366 then raise exception 'Date range is limited to 366 days'; end if;
  return query
  with days as (select generate_series(p_from,p_to,interval '1 day')::date d),
  visitors as (select v.visit_date d,count(*)::bigint n from public.pet_alert_daily_visitors v where v.visit_date between p_from and p_to group by v.visit_date)
  select days.d, coalesce(visitors.n,0)::bigint, coalesce(a.page_loads,0)::bigint, coalesce(a.sessions,0)::bigint,
         coalesce(e.photo_origin_fetches,0)::bigint, coalesce(e.photo_origin_bytes,0)::bigint, coalesce(e.photo_origin_errors,0)::bigint
  from days left join visitors on visitors.d=days.d
  left join public.pet_alert_activity_daily a on a.metric_date=days.d
  left join public.pet_alert_egress_origin_daily e on e.metric_date=days.d
  order by days.d desc;
end; $$;
revoke all on function public.get_pet_alert_egress_analytics(date,date) from public, anon;
grant execute on function public.get_pet_alert_egress_analytics(date,date) to authenticated;
