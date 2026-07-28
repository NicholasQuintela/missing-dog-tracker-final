-- Pet Alert PH: immediate-photo cleanup fallback and one-time legacy cleanup queue
-- Run once after deploying this update.

create table if not exists public.photo_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null default 'dog-photos',
  object_path text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  unique(bucket_id, object_path)
);

alter table public.photo_cleanup_queue enable row level security;

create or replace function public.queue_pet_alert_photo(p_path text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_path is not null and length(trim(p_path)) > 0 then
    insert into public.photo_cleanup_queue(bucket_id, object_path, reason)
    values ('dog-photos', p_path, p_reason)
    on conflict (bucket_id, object_path) do update
      set reason = excluded.reason,
          processed_at = null,
          last_error = null;
  end if;
end;
$$;

create or replace function public.pet_alert_queue_missing_dog_photo_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.queue_pet_alert_photo(old.photo_path, 'missing_report_deleted');
    perform public.queue_pet_alert_photo(old.found_photo_path, 'missing_report_deleted');
    return old;
  end if;

  if new.status = 'found' and old.status is distinct from 'found' then
    perform public.queue_pet_alert_photo(old.photo_path, 'missing_report_confirmed_found');
    new.photo_url := null;
    new.photo_path := null;
  end if;
  return new;
end;
$$;

drop trigger if exists pet_alert_missing_dog_photo_cleanup on public.missing_dogs;
create trigger pet_alert_missing_dog_photo_cleanup
before update or delete on public.missing_dogs
for each row execute function public.pet_alert_queue_missing_dog_photo_cleanup();

create or replace function public.pet_alert_queue_sighting_photo_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_pet_alert_photo(old.photo_path, 'sighting_deleted');
  return old;
end;
$$;

drop trigger if exists pet_alert_sighting_photo_cleanup on public.sightings;
create trigger pet_alert_sighting_photo_cleanup
before delete on public.sightings
for each row execute function public.pet_alert_queue_sighting_photo_cleanup();

-- One-time legacy cleanup: queue photos still attached to reports already marked found.
insert into public.photo_cleanup_queue(bucket_id, object_path, reason)
select 'dog-photos', photo_path, 'legacy_found_report_photo'
from public.missing_dogs
where status = 'found' and photo_path is not null
on conflict (bucket_id, object_path) do update
set reason = excluded.reason, processed_at = null, last_error = null;

-- Clear legacy references now. The Edge Function removes the underlying Storage objects.
update public.missing_dogs
set photo_url = null, photo_path = null
where status = 'found' and photo_path is not null;

notify pgrst, 'reload schema';

-- Allow owners to remove files stored under reports/<uid>/ and sightings/<uid>/.
drop policy if exists "Pet Alert owners delete own photos" on storage.objects;
create policy "Pet Alert owners delete own photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'dog-photos'
  and (storage.foldername(name))[1] in ('reports','sightings')
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Admins may remove moderated Pet Alert photos.
drop policy if exists "Pet Alert admins delete photos" on storage.objects;
create policy "Pet Alert admins delete photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'dog-photos'
  and exists (select 1 from public.admins a where a.user_id = auth.uid())
);
