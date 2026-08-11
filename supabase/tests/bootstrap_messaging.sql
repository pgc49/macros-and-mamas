-- Minimal production-shaped schema used only by disposable CI.
-- The historical repository migrations predate migration 002 and cannot
-- bootstrap a fresh project, so P0 migration tests isolate their dependencies.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'client',
  status text not null default 'pending'
);

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  kind text not null default 'chat',
  reply_to_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  notified_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_bytes integer
);

alter table public.messages enable row level security;

create policy messages_select_thread
  on public.messages for select to authenticated
  using (public.is_admin() or auth.uid() = client_id);

create policy messages_insert_own
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (public.is_admin() or auth.uid() = client_id)
  );

create policy messages_update_thread
  on public.messages for update to authenticated
  using (public.is_admin() or auth.uid() = client_id)
  with check (public.is_admin() or auth.uid() = client_id);

grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.messages to service_role;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null default '',
  kind text not null default 'chat',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  notified_at timestamptz,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_bytes integer
);

alter table public.conversation_messages enable row level security;

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

create policy message_attachments_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create policy message_attachments_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

