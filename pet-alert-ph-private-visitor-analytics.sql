-- Pet Alert PH private visitor analytics v1
-- Purpose: one tiny anonymous visit record per browser/device per Philippine day.
-- Admins can query daily unique visitor counts by date range.

create table if not exists public.pet_alert_daily_visitors (
  visit_date date not null default ((timezone('Asia/Manila', now()))::date),
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (visit_date, visitor_id)
);

alter table public.pet_alert_daily_visitors enable row level security;

-- No table SELECT/INSERT/UPDATE/DELETE policies are intentionally created.
-- Visitors and admins use the narrowly scoped SECURITY DEFINER functions below.

create or replace function public.record_pet_alert_visit(p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visitor_id is null then return; end if;
  insert into public.pet_alert_daily_visitors (visit_date, visitor_id)
  values ((timezone('Asia/Manila', now()))::date, p_visitor_id)
  on conflict (visit_date, visitor_id) do nothing;
end;
$$;

revoke all on function public.record_pet_alert_visit(uuid) from public;
grant execute on function public.record_pet_alert_visit(uuid) to anon, authenticated;

create or replace function public.get_pet_alert_visitor_analytics(p_from date, p_to date)
returns table (visit_date date, unique_visitors bigint)
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
  select v.visit_date, count(*)::bigint
  from public.pet_alert_daily_visitors v
  where v.visit_date between p_from and p_to
  group by v.visit_date
  order by v.visit_date desc;
end;
$$;

revoke all on function public.get_pet_alert_visitor_analytics(date, date) from public;
grant execute on function public.get_pet_alert_visitor_analytics(date, date) to authenticated;
