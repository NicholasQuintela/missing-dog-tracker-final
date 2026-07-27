-- Pet Alert PH: address-assisted report locations
-- Safe to run more than once.

alter table public.missing_dogs add column if not exists region text;
alter table public.missing_dogs add column if not exists city text;
alter table public.missing_dogs add column if not exists barangay text;
alter table public.missing_dogs add column if not exists street_or_landmark text;
alter table public.missing_dogs add column if not exists location_source text default 'manual_pin';

alter table public.sightings add column if not exists region text;
alter table public.sightings add column if not exists city text;
alter table public.sightings add column if not exists barangay text;
alter table public.sightings add column if not exists street_or_landmark text;
alter table public.sightings add column if not exists location_source text default 'manual_pin';

notify pgrst, 'reload schema';
