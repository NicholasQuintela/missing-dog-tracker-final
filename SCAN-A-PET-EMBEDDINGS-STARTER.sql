-- Scan a Pet starter schema (NOT YET APPLIED)
-- Review and run in a non-production Supabase project first.
-- Does not modify report/sighting rows, photo storage, or existing cache/proxy behavior.

create extension if not exists vector with schema extensions;

create table if not exists public.pet_scan_embeddings (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('missing_report', 'sighting')),
  source_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  model_version text not null,
  embedding extensions.vector(512) not null,
  species text check (species in ('dog', 'cat', 'unknown')),
  primary_color text,
  secondary_color text,
  distinctive_features text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, model_version)
);

create index if not exists pet_scan_embeddings_source_idx
  on public.pet_scan_embeddings (source_type, source_id);

create index if not exists pet_scan_embeddings_model_idx
  on public.pet_scan_embeddings (model_version);

create index if not exists pet_scan_embeddings_vector_idx
  on public.pet_scan_embeddings using hnsw (embedding extensions.vector_cosine_ops);

alter table public.pet_scan_embeddings enable row level security;
grant insert, update, delete on public.pet_scan_embeddings to authenticated;

-- Users can insert their own missing-report embeddings only when they own that report.
create policy "Owners insert missing report embeddings"
  on public.pet_scan_embeddings for insert to authenticated
  with check (
    owner_id = auth.uid()
    and source_type = 'missing_report'
    and exists (
      select 1 from public.missing_dogs d
      where d.id = source_id and d.owner_id = auth.uid()
    )
  );

-- Users can insert embeddings for their own sightings.
create policy "Reporters insert sighting embeddings"
  on public.pet_scan_embeddings for insert to authenticated
  with check (
    owner_id = auth.uid()
    and source_type = 'sighting'
    and exists (
      select 1 from public.sightings s
      where s.id = source_id and s.reporter_id = auth.uid()
    )
  );

create policy "Owners update missing report embeddings"
  on public.pet_scan_embeddings for update to authenticated
  using (
    owner_id = auth.uid()
    and source_type = 'missing_report'
    and exists (select 1 from public.missing_dogs d where d.id = source_id and d.owner_id = auth.uid())
  )
  with check (
    owner_id = auth.uid()
    and source_type = 'missing_report'
    and exists (select 1 from public.missing_dogs d where d.id = source_id and d.owner_id = auth.uid())
  );

create policy "Reporters update sighting embeddings"
  on public.pet_scan_embeddings for update to authenticated
  using (
    owner_id = auth.uid()
    and source_type = 'sighting'
    and exists (select 1 from public.sightings s where s.id = source_id and s.reporter_id = auth.uid())
  )
  with check (
    owner_id = auth.uid()
    and source_type = 'sighting'
    and exists (select 1 from public.sightings s where s.id = source_id and s.reporter_id = auth.uid())
  );

create policy "Owners delete their own pet embeddings"
  on public.pet_scan_embeddings for delete to authenticated
  using (owner_id = auth.uid());

-- No direct SELECT policy is granted. Embeddings are private and queried through
-- this narrowly scoped RPC, which returns only active missing-report IDs/scores.
create or replace function public.search_pet_scan_matches(
  p_embedding extensions.vector(512),
  p_model_version text,
  p_limit integer default 10
)
returns table (report_id uuid, similarity double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    d.id as report_id,
    (1 - (e.embedding operator(extensions.<=>) p_embedding))::double precision as similarity
  from public.pet_scan_embeddings e
  join public.missing_dogs d on d.id = e.source_id
  where auth.uid() is not null
    and e.source_type = 'missing_report'
    and e.model_version = p_model_version
    and d.status = 'active'
  order by e.embedding operator(extensions.<=>) p_embedding
  limit greatest(1, least(coalesce(p_limit, 10), 20));
$$;

revoke all on function public.search_pet_scan_matches(extensions.vector(512), text, integer) from public;
grant execute on function public.search_pet_scan_matches(extensions.vector(512), text, integer) to authenticated;
