-- P1 messaging durability:
-- 1) client-generated idempotency keys prevent duplicate persisted messages.
-- 2) transactional outbox rows survive browser/function interruption.

alter table public.messages
  add column if not exists client_message_id uuid;

alter table public.conversation_messages
  add column if not exists client_message_id uuid;

create unique index if not exists messages_sender_client_message_uidx
  on public.messages (sender_id, client_message_id)
  where client_message_id is not null;

create unique index if not exists conversation_messages_sender_client_message_uidx
  on public.conversation_messages (sender_id, client_message_id)
  where client_message_id is not null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.message_notification_outbox (
  id bigint generated always as identity primary key,
  message_type text not null check (message_type in ('dm', 'channel')),
  message_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  claim_token uuid,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (message_type, message_id)
);

create index if not exists message_notification_outbox_due_idx
  on public.message_notification_outbox (available_at, created_at)
  where status in ('pending', 'retry');

alter table public.message_notification_outbox enable row level security;
revoke all on table public.message_notification_outbox from public, anon, authenticated;
grant select, insert, update on table public.message_notification_outbox to service_role;
grant usage, select on sequence public.message_notification_outbox_id_seq to service_role;

create or replace function private.enqueue_dm_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.message_notification_outbox (message_type, message_id)
  values ('dm', new.id)
  on conflict (message_type, message_id) do nothing;
  return new;
end;
$$;

create or replace function private.enqueue_channel_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.message_notification_outbox (message_type, message_id)
  values ('channel', new.id)
  on conflict (message_type, message_id) do nothing;
  return new;
end;
$$;

drop trigger if exists messages_enqueue_notification on public.messages;
create trigger messages_enqueue_notification
after insert on public.messages
for each row execute function private.enqueue_dm_notification();

drop trigger if exists conversation_messages_enqueue_notification on public.conversation_messages;
create trigger conversation_messages_enqueue_notification
after insert on public.conversation_messages
for each row execute function private.enqueue_channel_notification();

create or replace function private.freeze_client_message_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.client_message_id := old.client_message_id;
  return new;
end;
$$;

drop trigger if exists messages_freeze_client_message_id on public.messages;
create trigger messages_freeze_client_message_id
before update on public.messages
for each row execute function private.freeze_client_message_id();

drop trigger if exists conversation_messages_freeze_client_message_id
  on public.conversation_messages;
create trigger conversation_messages_freeze_client_message_id
before update on public.conversation_messages
for each row execute function private.freeze_client_message_id();

create or replace function public.claim_message_notification_job(
  p_message_type text,
  p_message_id uuid
)
returns setof public.message_notification_outbox
language sql
volatile
security invoker
set search_path = public
as $$
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
    and (
      status in ('pending', 'retry')
      or (status = 'processing' and locked_at < now() - interval '5 minutes')
    )
  returning *;
$$;

revoke all on function public.claim_message_notification_job(text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_message_notification_job(text, uuid)
  to service_role;

create or replace function public.finish_message_notification_job(
  p_job_id bigint,
  p_claim_token uuid,
  p_success boolean,
  p_error text default null
)
returns setof public.message_notification_outbox
language sql
volatile
security invoker
set search_path = public
as $$
  update public.message_notification_outbox
  set
    status = case
      when p_success then 'sent'
      when attempts >= 6 then 'dead'
      else 'retry'
    end,
    available_at = case
      when p_success or attempts >= 6 then available_at
      else now() + make_interval(
        secs => least(900, (30 * power(2, greatest(0, attempts - 1)))::integer)
      )
    end,
    locked_at = null,
    claim_token = null,
    last_error = case
      when p_success then null
      else left(coalesce(p_error, 'notification failed'), 500)
    end,
    sent_at = case when p_success then now() else sent_at end
  where id = p_job_id
    and status = 'processing'
    and claim_token = p_claim_token
  returning *;
$$;

revoke all on function public.finish_message_notification_job(bigint, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.finish_message_notification_job(bigint, uuid, boolean, text)
  to service_role;

revoke all on function private.enqueue_dm_notification() from public;
revoke all on function private.enqueue_channel_notification() from public;
revoke all on function private.freeze_client_message_id() from public;

comment on table public.message_notification_outbox is
  'Transactional notification jobs for persisted DMs and channel messages.';
