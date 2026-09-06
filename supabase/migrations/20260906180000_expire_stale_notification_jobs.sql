-- Stop abandoned channel/DM notify jobs from re-fanning out for hours.
-- A hung processing lock was reclaimable forever because finish() never ran,
-- so "Big wins, mamas!!!!" kept pushing Founding Members the next day.

create table if not exists public.message_notification_deliveries (
  message_type text not null check (message_type in ('dm', 'channel')),
  message_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_type, message_id, profile_id)
);

create index if not exists message_notification_deliveries_message_idx
  on public.message_notification_deliveries (message_type, message_id);

alter table public.message_notification_deliveries enable row level security;
revoke all on table public.message_notification_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.message_notification_deliveries to service_role;

comment on table public.message_notification_deliveries is
  'Per-recipient push receipts so a retried notify job cannot blast the same mama twice.';

create or replace function public.expire_stale_message_notification_jobs()
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  update public.message_notification_outbox
  set
    status = 'dead',
    last_error = left(
      coalesce(nullif(last_error, ''), 'expired: too old to notify'),
      500
    ),
    locked_at = null,
    claim_token = null
  where status in ('pending', 'retry', 'processing')
    and created_at < now() - interval '2 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_stale_message_notification_jobs()
  from public, anon, authenticated;
grant execute on function public.expire_stale_message_notification_jobs()
  to service_role;

create or replace function public.claim_message_notification_job(
  p_message_type text,
  p_message_id uuid
)
returns setof public.message_notification_outbox
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  update public.message_notification_outbox
  set
    status = 'dead',
    last_error = left(
      coalesce(nullif(last_error, ''), 'expired: too old to notify'),
      500
    ),
    locked_at = null,
    claim_token = null
  where message_type = p_message_type
    and message_id = p_message_id
    and status in ('pending', 'retry', 'processing')
    and created_at < now() - interval '2 hours';

  return query
  update public.message_notification_outbox
  set
    status = 'processing',
    attempts = attempts + 1,
    locked_at = now(),
    claim_token = gen_random_uuid(),
    last_error = null
  where message_type = p_message_type
    and message_id = p_message_id
    and available_at <= now()
    and created_at >= now() - interval '2 hours'
    and (
      status in ('pending', 'retry')
      or (status = 'processing' and locked_at < now() - interval '5 minutes')
    )
  returning *;
end;
$$;

revoke all on function public.claim_message_notification_job(text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_message_notification_job(text, uuid)
  to service_role;

select public.expire_stale_message_notification_jobs();
