-- Pet Alert PH: public usernames and selectable reward currencies
create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username::text ~ '^[A-Za-z0-9._]{3,24}$'),
  constraint profiles_username_not_email check (position('@' in username::text) = 0)
);

alter table public.profiles enable row level security;
drop policy if exists "profiles readable by signed in users" on public.profiles;
create policy "profiles readable by signed in users" on public.profiles for select to authenticated using (true);
drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

create or replace function public.handle_pet_alert_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare proposed text;
begin
  proposed := lower(trim(coalesce(new.raw_user_meta_data->>'username','')));
  if proposed ~ '^[A-Za-z0-9._]{3,24}$' and position('@' in proposed)=0 and proposed not in ('admin','administrator','moderator','support','petalert','petalertph','root','staff') then
    begin insert into public.profiles(id,username) values(new.id,proposed) on conflict do nothing; exception when unique_violation then null; end;
  end if;
  return new;
end $$;

drop trigger if exists on_pet_alert_auth_user_created on auth.users;
create trigger on_pet_alert_auth_user_created after insert on auth.users for each row execute function public.handle_pet_alert_new_user();

alter table public.missing_dogs add column if not exists reward_currency text not null default 'PHP';
update public.missing_dogs set reward_currency='PHP' where reward_currency is null or reward_currency='';
alter table public.missing_dogs drop constraint if exists missing_dogs_reward_currency_check;
alter table public.missing_dogs add constraint missing_dogs_reward_currency_check check (reward_currency in ('PHP','USD','EUR','GBP','CAD','AUD','JPY','KRW','SGD','MYR','THB','IDR','VND','HKD'));

notify pgrst, 'reload schema';
