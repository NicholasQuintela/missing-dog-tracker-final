-- Pet Alert PH: repeat found claims + claim-first notification navigation
-- Run after the existing Pet Alert PH safety update and admin recursion repair.

create extension if not exists pgcrypto;

-- Safe admin helper used by claim review policies/functions.
create or replace function public.pet_alert_current_user_is_admin_v2()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.pet_alert_current_user_is_admin_v2() from public, anon;
grant execute on function public.pet_alert_current_user_is_admin_v2() to authenticated;

-- Link notifications to the exact found claim that should be reviewed.
alter table public.notifications
  add column if not exists found_claim_id uuid references public.found_claims(id) on delete cascade;
create index if not exists notifications_found_claim_idx
  on public.notifications(found_claim_id);

-- Remove any old one-claim-per-user-per-report uniqueness constraint.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.found_claims'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%dog_id%finder_id%'
  loop
    execute format('alter table public.found_claims drop constraint %I', c.conname);
  end loop;
end $$;

-- A finder may submit at most 10 claims for one individual report.
-- Only one claim can be pending review at a time.
create or replace function public.enforce_found_claim_attempt_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_pending integer;
begin
  if new.finder_id is null or new.finder_id <> auth.uid() then
    raise exception 'The found claim must belong to the signed-in account.';
  end if;

  select count(*) into v_total
  from public.found_claims
  where dog_id = new.dog_id and finder_id = new.finder_id;

  if v_total >= 10 then
    raise exception 'You have reached the maximum of 10 found claims for this report.';
  end if;

  select count(*) into v_pending
  from public.found_claims
  where dog_id = new.dog_id
    and finder_id = new.finder_id
    and status = 'pending';

  if v_pending > 0 then
    raise exception 'Your previous claim is still waiting for the owner to review it.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_found_claim_attempt_limit on public.found_claims;
create trigger enforce_found_claim_attempt_limit
before insert on public.found_claims
for each row execute function public.enforce_found_claim_attempt_limit();

-- Notify the owner with an explicit link to the claim review screen.
create or replace function public.notify_owner_about_found_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.missing_dogs;
  v_chat uuid;
begin
  select * into d from public.missing_dogs where id = new.dog_id;
  if d.owner_id is not null then
    select public.ensure_pawfinder_conversation(new.dog_id,new.finder_id,'found',new.id)
      into v_chat;

    insert into public.notifications(
      user_id, actor_id, dog_id, conversation_id, found_claim_id,
      type, title, message
    ) values (
      d.owner_id, new.finder_id, new.dog_id, v_chat, new.id,
      'found', 'Possible match for ' || d.name,
      new.finder_name || ' says they found your pet. Tap to review the proof image and accept or reject the claim.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_owner_found_claim on public.found_claims;
create trigger notify_owner_found_claim
after insert on public.found_claims
for each row execute function public.notify_owner_about_found_claim();

-- Review only pending claims. A confirmed match closes other pending claims.
create or replace function public.review_found_claim(p_claim_id uuid,p_decision text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.found_claims;
  d public.missing_dogs;
  v_chat uuid;
begin
  if p_decision not in ('confirmed','rejected') then
    raise exception 'Invalid decision';
  end if;

  select * into c from public.found_claims where id=p_claim_id for update;
  if not found then raise exception 'Claim not found'; end if;
  if c.status <> 'pending' then raise exception 'This claim has already been reviewed'; end if;

  select * into d from public.missing_dogs where id=c.dog_id for update;
  if d.owner_id <> auth.uid()
     and not public.pet_alert_current_user_is_admin_v2() then
    raise exception 'Only the report owner can review this claim';
  end if;

  update public.found_claims
  set status=p_decision, reviewed_at=now()
  where id=c.id;

  if p_decision='confirmed' then
    update public.missing_dogs
    set status='found', found_by=c.finder_name,
        found_by_user_id=c.finder_id, found_note=c.note,
        found_photo_url=c.photo_url, found_photo_path=c.photo_path,
        found_at=now()
    where id=c.dog_id;

    update public.found_claims
    set status='rejected', reviewed_at=now()
    where dog_id=c.dog_id and id<>c.id and status='pending';
  end if;

  select public.ensure_pawfinder_conversation(c.dog_id,c.finder_id,'found',c.id)
    into v_chat;

  perform public.create_pawfinder_activity(
    c.finder_id,d.owner_id,c.dog_id,v_chat,'found',
    case when p_decision='confirmed' then 'Owner confirmed the match' else 'Owner rejected the claim' end,
    case when p_decision='confirmed' then d.name||' was confirmed found.' else 'The report remains active. You may submit another claim, up to 10 total for this report.' end
  );
  return v_chat;
end;
$$;

grant execute on function public.review_found_claim(uuid,text) to authenticated;
notify pgrst, 'reload schema';
