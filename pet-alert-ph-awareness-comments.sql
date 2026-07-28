-- Pet Alert PH: community awareness, comments and helpful reactions
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.report_awareness (
  dog_id uuid not null references public.missing_dogs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (dog_id, user_id)
);
create index if not exists report_awareness_dog_idx on public.report_awareness(dog_id, created_at desc);
alter table public.report_awareness enable row level security;

drop policy if exists "Everyone can view report awareness" on public.report_awareness;
create policy "Everyone can view report awareness" on public.report_awareness
for select to anon, authenticated using (true);
drop policy if exists "Users can mark themselves aware" on public.report_awareness;
create policy "Users can mark themselves aware" on public.report_awareness
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users can remove their awareness" on public.report_awareness;
create policy "Users can remove their awareness" on public.report_awareness
for delete to authenticated using (user_id = auth.uid());

create table if not exists public.report_comments (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.missing_dogs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
create index if not exists report_comments_dog_created_idx on public.report_comments(dog_id, created_at);
create index if not exists report_comments_user_idx on public.report_comments(user_id);
alter table public.report_comments enable row level security;

drop policy if exists "Everyone can view active report comments" on public.report_comments;
create policy "Everyone can view active report comments" on public.report_comments
for select to anon, authenticated using (deleted_at is null);
drop policy if exists "Authenticated users can comment" on public.report_comments;
create policy "Authenticated users can comment" on public.report_comments
for insert to authenticated with check (user_id = auth.uid() and deleted_at is null);
drop policy if exists "Users can edit their comments" on public.report_comments;
create policy "Users can edit their comments" on public.report_comments
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.comment_helpful (
  dog_id uuid not null references public.missing_dogs(id) on delete cascade,
  comment_id uuid not null references public.report_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists comment_helpful_dog_idx on public.comment_helpful(dog_id);
alter table public.comment_helpful enable row level security;

drop policy if exists "Everyone can view helpful reactions" on public.comment_helpful;
create policy "Everyone can view helpful reactions" on public.comment_helpful
for select to anon, authenticated using (true);
drop policy if exists "Users can mark comments helpful" on public.comment_helpful;
create policy "Users can mark comments helpful" on public.comment_helpful
for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.report_comments c where c.id = comment_id and c.dog_id = dog_id and c.deleted_at is null)
);
drop policy if exists "Users can remove helpful reaction" on public.comment_helpful;
create policy "Users can remove helpful reaction" on public.comment_helpful
for delete to authenticated using (user_id = auth.uid());

-- Notify the report owner about a new public comment, except their own comments.
create or replace function public.pet_alert_notify_report_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_dog_name text;
begin
  select owner_id, name into v_owner, v_dog_name
  from public.missing_dogs where id = new.dog_id;

  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications(user_id, actor_id, dog_id, type, title, message)
    values (
      v_owner,
      new.user_id,
      new.dog_id,
      'comment',
      'New comment on ' || coalesce(v_dog_name, 'your report'),
      left(new.author_name || ' commented: “' || new.body || '”', 300)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.pet_alert_notify_report_comment() from public, anon, authenticated;
drop trigger if exists pet_alert_report_comment_notification on public.report_comments;
create trigger pet_alert_report_comment_notification
after insert on public.report_comments
for each row execute function public.pet_alert_notify_report_comment();

-- Realtime updates. Ignore duplicate-publication errors safely.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'report_awareness') then
    alter publication supabase_realtime add table public.report_awareness;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'report_comments') then
    alter publication supabase_realtime add table public.report_comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_helpful') then
    alter publication supabase_realtime add table public.comment_helpful;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Allow comments to enter the existing abuse moderation queue.
alter table public.abuse_reports drop constraint if exists abuse_reports_target_type_check;
alter table public.abuse_reports
  add constraint abuse_reports_target_type_check
  check (target_type in ('missing_dog','sighting','message','comment','user'));

create or replace function public.submit_pet_alert_abuse_report(
  p_target_type text,
  p_target_id uuid,
  p_category text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be logged in.'; end if;
  if p_target_type not in ('missing_dog','sighting','message','comment','user') then raise exception 'Invalid report target.'; end if;
  if p_category not in ('fake_report','spam','scam','harassment','inappropriate','other') then raise exception 'Invalid report reason.'; end if;
  if p_details is not null and length(p_details)>1000 then raise exception 'Details are too long.'; end if;

  if p_target_type='missing_dog' and not exists(select 1 from public.missing_dogs where id=p_target_id) then raise exception 'Report not found.'; end if;
  if p_target_type='sighting' and not exists(select 1 from public.sightings where id=p_target_id) then raise exception 'Sighting not found.'; end if;
  if p_target_type='comment' and not exists(select 1 from public.report_comments where id=p_target_id and deleted_at is null) then raise exception 'Comment not found.'; end if;
  if p_target_type='message' and not exists(
    select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
    where m.id=p_target_id and auth.uid() in (c.owner_id,c.volunteer_id)
  ) then raise exception 'Message not found or access denied.'; end if;

  insert into public.abuse_reports(reporter_id,target_type,target_id,reason,details)
  values(auth.uid(),p_target_type,p_target_id,p_category,nullif(trim(p_details),''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_pet_alert_abuse_report(text,uuid,text,text) from public,anon;
grant execute on function public.submit_pet_alert_abuse_report(text,uuid,text,text) to authenticated;

create or replace function public.moderate_pet_alert_abuse_report(
  p_report_id uuid,
  p_action text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_item public.abuse_reports%rowtype;
begin
  if not public.pet_alert_is_admin_moderation_v4() then raise exception 'Admin access required.'; end if;
  if p_action not in ('remove','ignore') then raise exception 'Invalid moderation action.'; end if;
  select * into v_item from public.abuse_reports where id=p_report_id for update;
  if not found then raise exception 'Abuse report not found.'; end if;

  if p_action='remove' then
    if v_item.target_type='missing_dog' then delete from public.missing_dogs where id=v_item.target_id;
    elsif v_item.target_type='sighting' then delete from public.sightings where id=v_item.target_id;
    elsif v_item.target_type='message' then update public.messages set body='[Message removed by a Pet Alert PH moderator]' where id=v_item.target_id;
    elsif v_item.target_type='comment' then update public.report_comments set deleted_at=now(), body='[Comment removed by a Pet Alert PH moderator]' where id=v_item.target_id;
    end if;
    update public.abuse_reports set status='resolved',moderation_notes=nullif(trim(p_notes),''),moderated_by=auth.uid(),moderated_at=now() where id=p_report_id;
  else
    update public.abuse_reports set status='dismissed',moderation_notes=nullif(trim(p_notes),''),moderated_by=auth.uid(),moderated_at=now() where id=p_report_id;
  end if;
end $$;
revoke all on function public.moderate_pet_alert_abuse_report(uuid,text,text) from public,anon;
grant execute on function public.moderate_pet_alert_abuse_report(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
