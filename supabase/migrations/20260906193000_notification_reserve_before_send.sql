-- At-most-once channel/DM push: reserve the recipient before send-push,
-- and never reclaim a job whose source message is already notified.

alter table public.messages
  add column if not exists notified_at timestamptz;

alter table public.conversation_messages
  add column if not exists notified_at timestamptz;

-- claim() is invoker-security and reads notified_at. CI's disposable
-- schema only granted these tables to authenticated.
grant select on table public.messages to service_role;
grant select, update on table public.conversation_messages to service_role;
grant select on table public.profiles to service_role;

create or replace function public.reserve_message_notification_delivery(
  p_message_type text,
  p_message_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  if p_message_type not in ('dm', 'channel')
    or p_message_id is null
    or p_profile_id is null then
    return false;
  end if;

  insert into public.message_notification_deliveries (
    message_type, message_id, profile_id
  )
  values (p_message_type, p_message_id, p_profile_id)
  on conflict (message_type, message_id, profile_id) do nothing;

  return found;
end;
$$;

create or replace function public.release_message_notification_delivery(
  p_message_type text,
  p_message_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  delete from public.message_notification_deliveries
  where message_type = p_message_type
    and message_id = p_message_id
    and profile_id = p_profile_id;
  return found;
end;
$$;

revoke all on function public.reserve_message_notification_delivery(text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.release_message_notification_delivery(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_message_notification_delivery(text, uuid, uuid)
  to service_role;
grant execute on function public.release_message_notification_delivery(text, uuid, uuid)
  to service_role;

comment on function public.reserve_message_notification_delivery(text, uuid, uuid) is
  'Inserts a per-recipient receipt. False means that mama already got this push.';

create or replace function public.expire_stale_message_notification_jobs()
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  n integer := 0;
  closed integer := 0;
begin
  update public.message_notification_outbox o
  set
    status = 'sent',
    sent_at = coalesce(o.sent_at, now()),
    locked_at = null,
    claim_token = null,
    last_error = null
  where o.status in ('pending', 'retry', 'processing')
    and (
      (
        o.message_type = 'channel'
        and exists (
          select 1
          from public.conversation_messages m
          where m.id = o.message_id
            and m.notified_at is not null
        )
      )
      or (
        o.message_type = 'dm'
        and exists (
          select 1
          from public.messages m
          where m.id = o.message_id
            and m.notified_at is not null
        )
      )
    );
  get diagnostics closed = row_count;
  n := n + closed;

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
  get diagnostics closed = row_count;
  n := n + closed;

  update public.message_notification_outbox
  set
    status = 'dead',
    last_error = left(
      coalesce(nullif(last_error, ''), 'expired: too many abandoned claims'),
      500
    ),
    locked_at = null,
    claim_token = null
  where status = 'processing'
    and locked_at < now() - interval '5 minutes'
    and attempts >= 6;
  get diagnostics closed = row_count;
  n := n + closed;

  return n;
end;
$$;

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
  update public.message_notification_outbox o
  set
    status = 'sent',
    sent_at = coalesce(o.sent_at, now()),
    locked_at = null,
    claim_token = null,
    last_error = null
  where o.message_type = p_message_type
    and o.message_id = p_message_id
    and o.status in ('pending', 'retry', 'processing')
    and (
      (
        p_message_type = 'channel'
        and exists (
          select 1
          from public.conversation_messages m
          where m.id = p_message_id
            and m.notified_at is not null
        )
      )
      or (
        p_message_type = 'dm'
        and exists (
          select 1
          from public.messages m
          where m.id = p_message_id
            and m.notified_at is not null
        )
      )
    );

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

  update public.message_notification_outbox
  set
    status = 'dead',
    last_error = left(
      coalesce(nullif(last_error, ''), 'expired: too many abandoned claims'),
      500
    ),
    locked_at = null,
    claim_token = null
  where message_type = p_message_type
    and message_id = p_message_id
    and status = 'processing'
    and locked_at < now() - interval '5 minutes'
    and attempts >= 6;

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
