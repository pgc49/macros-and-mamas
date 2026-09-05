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
  created_at timestamptz not null default now(),
  read_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_bytes integer,
  attachment_width integer,
  attachment_height integer
);

alter table public.messages enable row level security;

create policy messages_select_thread
  on public.messages for select to authenticated
  using (public.is_admin() or auth.uid() = client_id);

grant select, insert, update, delete on public.messages to authenticated;
grant select on public.profiles to authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
create policy push_select_own_or_admin
  on public.push_subscriptions for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy push_insert_own
  on public.push_subscriptions for insert to authenticated
  with check (profile_id = auth.uid());
create policy push_update_own
  on public.push_subscriptions for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
create policy push_delete_own
  on public.push_subscriptions for delete to authenticated
  using (profile_id = auth.uid() or public.is_admin());
grant select, insert, update, delete on public.push_subscriptions
  to authenticated, service_role;

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
  attachment_bytes integer,
  attachment_width integer,
  attachment_height integer
);

alter table public.conversation_messages enable row level security;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text,
  label text
);

create table if not exists public.conversation_members (
  conversation_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  notify_level text,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

alter table public.conversation_members enable row level security;
alter table public.conversation_members force row level security;

grant select, insert, update on table public.conversation_members to authenticated;
grant select, insert on table public.conversation_messages to authenticated;
grant select, insert on table public.conversations to authenticated;

