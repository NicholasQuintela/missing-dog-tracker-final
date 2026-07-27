-- Pet Alert PH: slow security update
create extension if not exists pgcrypto;

-- Admins
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','super_admin')),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "Admins can view admins" on public.admins;
create policy "Admins can view admins" on public.admins for select to authenticated
using (exists(select 1 from public.admins a where a.user_id=auth.uid()));
insert into public.admins(user_id,role)
select id,'super_admin' from auth.users where lower(email)=lower('quintelanicholas3@gmail.com')
on conflict(user_id) do update set role='super_admin';

-- Abuse reports
create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check(target_type in ('missing_dog','sighting','user','message')),
  target_id uuid not null,
  reason text not null check(length(trim(reason)) between 5 and 500),
  details text,
  status text not null default 'pending' check(status in ('pending','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);
alter table public.abuse_reports enable row level security;
drop policy if exists "Users create abuse reports" on public.abuse_reports;
create policy "Users create abuse reports" on public.abuse_reports for insert to authenticated with check(reporter_id=auth.uid());
drop policy if exists "Users view own abuse reports" on public.abuse_reports;
create policy "Users view own abuse reports" on public.abuse_reports for select to authenticated using(reporter_id=auth.uid() or exists(select 1 from public.admins a where a.user_id=auth.uid()));
drop policy if exists "Admins update abuse reports" on public.abuse_reports;
create policy "Admins update abuse reports" on public.abuse_reports for update to authenticated using(exists(select 1 from public.admins a where a.user_id=auth.uid())) with check(exists(select 1 from public.admins a where a.user_id=auth.uid()));

-- Monthly limits: 100 each
create or replace function public.enforce_monthly_pet_alert_limits() returns trigger language plpgsql security definer set search_path=public as $$
declare v_count int;
begin
  if tg_table_name='missing_dogs' then
    if new.owner_id is null or new.owner_id<>auth.uid() then raise exception 'Invalid report owner'; end if;
    select count(*) into v_count from public.missing_dogs where owner_id=auth.uid() and created_at>=date_trunc('month',now());
    if v_count>=100 then raise exception 'Monthly limit reached: 100 missing-pet reports.'; end if;
  elsif tg_table_name='sightings' then
    if new.reporter_id is null or new.reporter_id<>auth.uid() then raise exception 'Invalid sighting reporter'; end if;
    select count(*) into v_count from public.sightings where reporter_id=auth.uid() and created_at>=date_trunc('month',now());
    if v_count>=100 then raise exception 'Monthly limit reached: 100 sighting reports.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists enforce_missing_dog_monthly_limit on public.missing_dogs;
create trigger enforce_missing_dog_monthly_limit before insert on public.missing_dogs for each row execute function public.enforce_monthly_pet_alert_limits();
drop trigger if exists enforce_sighting_monthly_limit on public.sightings;
create trigger enforce_sighting_monthly_limit before insert on public.sightings for each row execute function public.enforce_monthly_pet_alert_limits();

-- Owner-only report edits/deletes
alter table public.missing_dogs enable row level security;
drop policy if exists "Anyone can mark dogs as found" on public.missing_dogs;
drop policy if exists "Authenticated users can update reports" on public.missing_dogs;
drop policy if exists "Owners can update own reports" on public.missing_dogs;
create policy "Owners can update own reports" on public.missing_dogs for update to authenticated
using(owner_id=auth.uid() or exists(select 1 from public.admins a where a.user_id=auth.uid()))
with check(owner_id=auth.uid() or exists(select 1 from public.admins a where a.user_id=auth.uid()));
drop policy if exists "Owners can delete own reports" on public.missing_dogs;
create policy "Owners can delete own reports" on public.missing_dogs for delete to authenticated
using(owner_id=auth.uid() or exists(select 1 from public.admins a where a.user_id=auth.uid()));

-- Volunteer privacy
alter table public.volunteers enable row level security;
drop policy if exists "Anyone can view volunteers" on public.volunteers;
drop policy if exists "Participants can view volunteers" on public.volunteers;
create policy "Participants can view volunteers" on public.volunteers for select to authenticated using(
 user_id=auth.uid() or exists(select 1 from public.missing_dogs d where d.id=dog_id and d.owner_id=auth.uid()) or exists(select 1 from public.admins a where a.user_id=auth.uid())
);
create or replace function public.get_volunteer_counts() returns table(dog_id uuid, volunteer_count bigint)
language sql security definer set search_path=public as $$ select dog_id,count(*) from public.volunteers group by dog_id $$;
grant execute on function public.get_volunteer_counts() to anon,authenticated;

-- Found claims: owner confirms before report becomes found
create table if not exists public.found_claims (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.missing_dogs(id) on delete cascade,
  finder_id uuid not null references auth.users(id) on delete cascade,
  finder_name text not null,
  note text,
  photo_url text,
  photo_path text,
  status text not null default 'pending' check(status in ('pending','confirmed','rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(dog_id,finder_id)
);
alter table public.found_claims enable row level security;
drop policy if exists "Finder creates found claim" on public.found_claims;
create policy "Finder creates found claim" on public.found_claims for insert to authenticated with check(finder_id=auth.uid() and exists(select 1 from public.missing_dogs d where d.id=dog_id and d.owner_id<>auth.uid() and d.status='active'));
drop policy if exists "Participants view found claims" on public.found_claims;
create policy "Participants view found claims" on public.found_claims for select to authenticated using(finder_id=auth.uid() or exists(select 1 from public.missing_dogs d where d.id=dog_id and d.owner_id=auth.uid()) or exists(select 1 from public.admins a where a.user_id=auth.uid()));

create or replace function public.review_found_claim(p_claim_id uuid,p_decision text) returns uuid language plpgsql security definer set search_path=public as $$
declare c public.found_claims; d public.missing_dogs; v_chat uuid;
begin
 if p_decision not in ('confirmed','rejected') then raise exception 'Invalid decision'; end if;
 select * into c from public.found_claims where id=p_claim_id for update;
 if not found then raise exception 'Claim not found'; end if;
 select * into d from public.missing_dogs where id=c.dog_id for update;
 if d.owner_id<>auth.uid() and not exists(select 1 from public.admins a where a.user_id=auth.uid()) then raise exception 'Only the report owner can review this claim'; end if;
 update public.found_claims set status=p_decision,reviewed_at=now() where id=c.id;
 if p_decision='confirmed' then
   update public.missing_dogs set status='found',found_by=c.finder_name,found_by_user_id=c.finder_id,found_note=c.note,found_photo_url=c.photo_url,found_photo_path=c.photo_path,found_at=now() where id=c.dog_id;
 end if;
 select public.ensure_pawfinder_conversation(c.dog_id,c.finder_id,'found',c.id) into v_chat;
 perform public.create_pawfinder_activity(c.finder_id,d.owner_id,c.dog_id,v_chat,'found',case when p_decision='confirmed' then 'Owner confirmed the match' else 'Owner did not confirm the match' end,case when p_decision='confirmed' then d.name||' was confirmed found.' else 'The report remains active.' end);
 return v_chat;
end $$;
grant execute on function public.review_found_claim(uuid,text) to authenticated;

create or replace function public.notify_owner_about_found_claim() returns trigger language plpgsql security definer set search_path=public as $$
declare d public.missing_dogs; v_chat uuid;
begin
 select * into d from public.missing_dogs where id=new.dog_id;
 if d.owner_id is not null then
   select public.ensure_pawfinder_conversation(new.dog_id,new.finder_id,'found',new.id) into v_chat;
   perform public.create_pawfinder_activity(d.owner_id,new.finder_id,new.dog_id,v_chat,'found','Possible match for '||d.name,new.finder_name||' says they found your pet. Review and confirm or reject the claim.');
 end if;
 return new;
end $$;
drop trigger if exists notify_owner_found_claim on public.found_claims;
create trigger notify_owner_found_claim after insert on public.found_claims for each row execute function public.notify_owner_about_found_claim();

notify pgrst,'reload schema';
