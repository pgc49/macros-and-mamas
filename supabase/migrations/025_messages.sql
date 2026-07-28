-- ==================================================================
-- 025_messages.sql
-- In-app 1:1 messaging (mama ↔ Callie) + web push subscriptions
-- ==================================================================

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_client_created_idx
  on public.messages (client_id, created_at desc);
create index if not exists messages_client_unread_idx
  on public.messages (client_id, read_at)
  where read_at is null;

comment on table public.messages is
  '1:1 DMs between one mama (client_id) and Callie/admin. No mama-to-mama.';

alter table public.messages enable row level security;

drop policy if exists "messages_select_thread" on public.messages;
create policy "messages_select_thread"
  on public.messages for select to authenticated
  using (public.is_admin() or auth.uid() = client_id);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      public.is_admin()
      or (auth.uid() = client_id and sender_id = client_id)
    )
    and char_length(trim(body)) between 1 and 2000
  );

drop policy if exists "messages_update_read" on public.messages;
create policy "messages_update_read"
  on public.messages for update to authenticated
  using (public.is_admin() or auth.uid() = client_id)
  with check (public.is_admin() or auth.uid() = client_id);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_select_own_or_admin" on public.push_subscriptions;
create policy "push_select_own_or_admin"
  on public.push_subscriptions for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "push_insert_own" on public.push_subscriptions;
create policy "push_insert_own"
  on public.push_subscriptions for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "push_update_own" on public.push_subscriptions;
create policy "push_update_own"
  on public.push_subscriptions for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_delete_own"
  on public.push_subscriptions for delete to authenticated
  using (profile_id = auth.uid() or public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
