-- Operational controls for primary messaging.

create table if not exists public.messaging_runtime_config (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'normal'
    check (mode in ('normal', 'read_only', 'off')),
  attachments_enabled boolean not null default true,
  notifications_enabled boolean not null default true,
  reason text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null
);

create table if not exists public.messaging_runtime_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null unique,
  previous_value jsonb not null,
  next_value jsonb not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

alter table public.messaging_runtime_config enable row level security;
alter table public.messaging_runtime_audit enable row level security;
revoke all on table public.messaging_runtime_config
  from public, anon, authenticated, service_role;
revoke all on table public.messaging_runtime_audit
  from public, anon, authenticated, service_role;
grant select on table public.messaging_runtime_config to service_role;
grant select, insert on table public.messaging_runtime_audit to service_role;
grant usage, select on sequence public.messaging_runtime_audit_id_seq to service_role;

insert into public.messaging_runtime_config (singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function public.messaging_runtime_status()
returns table (
  mode text,
  attachments_enabled boolean,
  notifications_enabled boolean,
  reason text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    config.mode,
    config.attachments_enabled,
    config.notifications_enabled,
    config.reason,
    config.updated_at
  from public.messaging_runtime_config config
  where config.singleton = true;
$$;

revoke all on function public.messaging_runtime_status() from public, anon;
grant execute on function public.messaging_runtime_status() to authenticated, service_role;

create or replace function public.update_messaging_runtime(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_mode text default null,
  p_attachments_enabled boolean default null,
  p_notifications_enabled boolean default null,
  p_reason text default null
)
returns setof public.messaging_runtime_config
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  previous_row public.messaging_runtime_config;
  next_row public.messaging_runtime_config;
begin
  if p_request_id is null or p_expected_updated_at is null then
    raise exception 'runtime request id and version required';
  end if;
  if p_mode is not null and p_mode not in ('normal', 'read_only', 'off') then
    raise exception 'invalid messaging mode';
  end if;

  select * into previous_row
  from public.messaging_runtime_config
  where singleton = true
  for update;

  if previous_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'messaging runtime changed; refresh and retry'
      using errcode = '40001';
  end if;

  update public.messaging_runtime_config
  set
    mode = coalesce(p_mode, previous_row.mode),
    attachments_enabled = coalesce(p_attachments_enabled, previous_row.attachments_enabled),
    notifications_enabled = coalesce(p_notifications_enabled, previous_row.notifications_enabled),
    reason = case
      when p_reason is null then previous_row.reason
      else left(p_reason, 200)
    end,
    updated_at = clock_timestamp(),
    updated_by = p_actor_id
  where singleton = true
  returning * into next_row;

  insert into public.messaging_runtime_audit (
    actor_id,
    request_id,
    previous_value,
    next_value,
    reason
  ) values (
    p_actor_id,
    p_request_id,
    to_jsonb(previous_row),
    to_jsonb(next_row),
    coalesce(p_reason, '')
  );

  return next next_row;
end;
$$;

revoke all on function public.update_messaging_runtime(
  uuid, uuid, timestamptz, text, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.update_messaging_runtime(
  uuid, uuid, timestamptz, text, boolean, boolean, text
) to service_role;

create or replace function public.messaging_attachments_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select config.attachments_enabled and config.mode = 'normal'
    from public.messaging_runtime_config config
    where config.singleton = true
  ), false);
$$;

revoke all on function public.messaging_attachments_enabled() from public, anon;
grant execute on function public.messaging_attachments_enabled() to authenticated, service_role;

create schema if not exists private;

create or replace function private.enforce_messaging_write_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  runtime_mode text;
begin
  select config.mode
  into runtime_mode
  from public.messaging_runtime_config config
  where config.singleton = true;

  if coalesce(runtime_mode, 'off') <> 'normal' then
    raise exception 'messaging is temporarily read-only'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_enforce_runtime_mode on public.messages;
create trigger messages_enforce_runtime_mode
before insert on public.messages
for each row execute function private.enforce_messaging_write_mode();

drop trigger if exists conversation_messages_enforce_runtime_mode
  on public.conversation_messages;
create trigger conversation_messages_enforce_runtime_mode
before insert on public.conversation_messages
for each row execute function private.enforce_messaging_write_mode();

revoke all on function private.enforce_messaging_write_mode() from public;

create or replace function private.enforce_messaging_mutation_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  runtime_mode text;
begin
  select config.mode
  into runtime_mode
  from public.messaging_runtime_config config
  where config.singleton = true;

  if coalesce(runtime_mode, 'off') = 'normal' then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  if TG_TABLE_NAME in ('message_reactions', 'conversation_message_reactions') then
    raise exception 'messaging is temporarily read-only';
  end if;

  if TG_TABLE_NAME = 'messages'
     and (
       to_jsonb(new) - 'read_at' - 'notified_at'
       is distinct from
       to_jsonb(old) - 'read_at' - 'notified_at'
     )
  then
    raise exception 'messaging is temporarily read-only';
  end if;

  if TG_TABLE_NAME = 'conversation_messages'
     and (
       to_jsonb(new) - 'notified_at'
       is distinct from
       to_jsonb(old) - 'notified_at'
     )
  then
    raise exception 'messaging is temporarily read-only';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_enforce_runtime_mutation on public.messages;
create trigger messages_enforce_runtime_mutation
before update on public.messages
for each row execute function private.enforce_messaging_mutation_mode();

drop trigger if exists conversation_messages_enforce_runtime_mutation
  on public.conversation_messages;
create trigger conversation_messages_enforce_runtime_mutation
before update on public.conversation_messages
for each row execute function private.enforce_messaging_mutation_mode();

drop trigger if exists message_reactions_enforce_runtime_mode
  on public.message_reactions;
create trigger message_reactions_enforce_runtime_mode
before insert or delete on public.message_reactions
for each row execute function private.enforce_messaging_mutation_mode();

drop trigger if exists conversation_message_reactions_enforce_runtime_mode
  on public.conversation_message_reactions;
create trigger conversation_message_reactions_enforce_runtime_mode
before insert or delete on public.conversation_message_reactions
for each row execute function private.enforce_messaging_mutation_mode();

revoke all on function private.enforce_messaging_mutation_mode() from public;

create or replace function private.freeze_dm_notified_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role'
     and new.notified_at is distinct from old.notified_at
  then
    raise exception 'notification state is server-managed';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_freeze_notified_at on public.messages;
create trigger messages_freeze_notified_at
before update on public.messages
for each row execute function private.freeze_dm_notified_at();

revoke all on function private.freeze_dm_notified_at() from public;

drop policy if exists "message_attachments_insert" on storage.objects;
create policy "message_attachments_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.messaging_attachments_enabled()
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and coalesce(metadata->>'mimetype', '') !~* '^audio/'
      )
    )
  );

drop policy if exists "channel_attachments_insert" on storage.objects;
create policy "channel_attachments_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channel-attachments'
    and public.messaging_attachments_enabled()
    and public.is_active_conversation_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text
    and (
      public.is_admin()
      or coalesce(metadata->>'mimetype', '') !~* '^audio/'
    )
  );

create or replace function public.claim_message_notification_job(
  p_message_type text,
  p_message_id uuid
)
returns setof public.message_notification_outbox
language sql
volatile
security invoker
set search_path = ''
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
    and created_at >= now() - interval '24 hours'
    and coalesce((
      select config.notifications_enabled
      from public.messaging_runtime_config config
      where config.singleton = true
    ), false)
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

alter table public.message_notification_outbox
  drop constraint if exists message_notification_outbox_status_check;
alter table public.message_notification_outbox
  add constraint message_notification_outbox_status_check
  check (status in (
    'pending', 'processing', 'retry', 'sent', 'dead', 'expired', 'acknowledged'
  ));

create or replace function public.expire_message_notification_jobs()
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  with expired as (
    update public.message_notification_outbox
    set
      status = 'expired',
      locked_at = null,
      claim_token = null,
      last_error = 'notification expired after 24 hours'
    where status in ('pending', 'retry', 'processing')
      and created_at < now() - interval '24 hours'
    returning 1
  )
  select count(*)::integer from expired;
$$;

revoke all on function public.expire_message_notification_jobs()
  from public, anon, authenticated;
grant execute on function public.expire_message_notification_jobs()
  to service_role;

create table if not exists public.message_notification_incident_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  acknowledged_count integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.message_notification_incident_audit enable row level security;
revoke all on table public.message_notification_incident_audit
  from public, anon, authenticated, service_role;
grant select on table public.message_notification_incident_audit to service_role;
grant usage, select on sequence public.message_notification_incident_audit_id_seq
  to service_role;

create or replace function public.acknowledge_dead_notification_jobs(
  p_actor_id uuid,
  p_reason text
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_actor_id is null or char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'actor and acknowledgement reason required';
  end if;
  update public.message_notification_outbox
  set status = 'acknowledged'
  where status = 'dead';
  get diagnostics affected = row_count;
  insert into public.message_notification_incident_audit (
    actor_id, acknowledged_count, reason
  ) values (
    p_actor_id, affected, left(trim(p_reason), 500)
  );
  return affected;
end;
$$;

revoke all on function public.acknowledge_dead_notification_jobs(uuid, text)
  from public, anon, authenticated;
grant execute on function public.acknowledge_dead_notification_jobs(uuid, text)
  to service_role;

create or replace function public.cleanup_message_notification_history()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with candidates as (
    select id
    from public.message_notification_outbox
    where status in ('sent', 'expired', 'acknowledged')
      and created_at < now() - interval '30 days'
    order by created_at
    limit 500
  ), removed as (
    delete from public.message_notification_outbox
    where id in (select id from candidates)
    returning 1
  )
  select count(*)::integer from removed;
$$;

revoke all on function public.cleanup_message_notification_history()
  from public, anon, authenticated;
grant execute on function public.cleanup_message_notification_history()
  to service_role;

create index if not exists message_notification_outbox_health_idx
  on public.message_notification_outbox (status, created_at)
  where status in ('pending', 'retry', 'processing', 'dead');

create index if not exists message_notification_outbox_retention_idx
  on public.message_notification_outbox (status, created_at)
  where status in ('sent', 'expired', 'acknowledged');

create or replace function public.messaging_health_snapshot()
returns table (
  pending bigint,
  retry bigint,
  processing bigint,
  dead bigint,
  expired bigint,
  oldest_open_at timestamptz,
  stale_processing bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'retry'),
    count(*) filter (where status = 'processing'),
    count(*) filter (where status = 'dead'),
    (
      select count(*)
      from public.message_notification_outbox expired_jobs
      where expired_jobs.status = 'expired'
    ),
    min(created_at) filter (where status in ('pending', 'retry', 'processing')),
    count(*) filter (
      where status = 'processing'
        and locked_at < now() - interval '5 minutes'
    )
  from public.message_notification_outbox
  where status in ('pending', 'retry', 'processing', 'dead');
$$;

revoke all on function public.messaging_health_snapshot()
  from public, anon, authenticated;
grant execute on function public.messaging_health_snapshot()
  to service_role;

