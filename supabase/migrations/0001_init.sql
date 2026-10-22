-- GO Compass optional cloud schema.
-- The app works fully offline without any of this. These objects power:
--   1. AI coach rate limiting (consume_ai_quota)
--   2. optional encrypted-in-transit cloud backup of the collection (collection_backups) with Row Level Security

-- ---------------------------------------------------------------------------------------------------------
-- AI rate limiting
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,            -- 'h:2026-10-22T14' or 'd:2026-10-22'
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

-- RLS on with NO policies: clients can never read/write it; only the service role (Edge Function) can.
alter table public.ai_usage enable row level security;

create or replace function public.consume_ai_quota(p_user uuid, p_hour_limit integer, p_day_limit integer)
returns table (allowed boolean, remaining_hour integer, remaining_day integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  hb text := 'h:' || to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24');
  db text := 'd:' || to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  hc integer;
  dc integer;
begin
  -- serialise per user so concurrent calls cannot overshoot the limit
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select count into hc from public.ai_usage where user_id = p_user and bucket = hb;
  select count into dc from public.ai_usage where user_id = p_user and bucket = db;
  hc := coalesce(hc, 0);
  dc := coalesce(dc, 0);

  if hc >= p_hour_limit or dc >= p_day_limit then
    allowed := false;
    remaining_hour := greatest(p_hour_limit - hc, 0);
    remaining_day := greatest(p_day_limit - dc, 0);
    retry_after := case when hc >= p_hour_limit
      then 3600 - (extract(epoch from (now() at time zone 'utc')::time)::integer % 3600)
      else 3600 end;
    return next;
    return;
  end if;

  insert into public.ai_usage (user_id, bucket, count) values (p_user, hb, 1)
    on conflict (user_id, bucket) do update set count = public.ai_usage.count + 1, updated_at = now();
  insert into public.ai_usage (user_id, bucket, count) values (p_user, db, 1)
    on conflict (user_id, bucket) do update set count = public.ai_usage.count + 1, updated_at = now();

  -- housekeeping: drop buckets older than 3 days for this user
  delete from public.ai_usage where user_id = p_user and updated_at < now() - interval '3 days';

  allowed := true;
  remaining_hour := p_hour_limit - hc - 1;
  remaining_day := p_day_limit - dc - 1;
  retry_after := 0;
  return next;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- optional cloud backup (cross-device restore for signed-in users)
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.collection_backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  pokemon_count integer not null default 0,
  schema_version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint payload_size check (pg_column_size(payload) < 20 * 1024 * 1024)
);

alter table public.collection_backups enable row level security;

create policy "backups_select_own" on public.collection_backups
  for select to authenticated using (auth.uid() = user_id);
create policy "backups_insert_own" on public.collection_backups
  for insert to authenticated with check (auth.uid() = user_id);
create policy "backups_update_own" on public.collection_backups
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "backups_delete_own" on public.collection_backups
  for delete to authenticated using (auth.uid() = user_id);
