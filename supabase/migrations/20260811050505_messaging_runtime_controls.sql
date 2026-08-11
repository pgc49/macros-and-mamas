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

alter table public.messaging_runtime_config enable row level security;
revoke all on table public.messaging_runtime_config from public, anon, authenticated;
grant select, insert, update on table public.messaging_runtime_config to service_role;

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

create or replace function public.messaging_attachments_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select config.attachments_enabled
    from public.messaging_runtime_config config
    where config.singleton = true
  ), true);
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

  if coalesce(runtime_mode, 'normal') <> 'normal' then
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
    and coalesce((
      select config.notifications_enabled
      from public.messaging_runtime_config config
      where config.singleton = true
    ), true)
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

