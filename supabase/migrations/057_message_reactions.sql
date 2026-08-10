-- ==================================================================
-- 057_message_reactions.sql
-- iMessage-style tapbacks on 1:1 messages + cohort channel messages.
-- One reaction per user per message (toggle / replace). Fixed emoji set.
-- ==================================================================

-- Allowed tapbacks (keep in sync with src/lib/messageReactions.js)
-- ❤️ 👍 👎 😂 ‼️ ❓

-- ---------------------------------------------------------------------------
-- 1:1 DM reactions
-- ---------------------------------------------------------------------------
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint message_reactions_emoji_allowed check (
    emoji in ('❤️', '👍', '👎', '😂', '‼️', '❓')
  ),
  constraint message_reactions_unique_user unique (message_id, user_id)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

create index if not exists message_reactions_user_idx
  on public.message_reactions (user_id);

comment on table public.message_reactions is
  'Tapback reactions on 1:1 mama↔Callie messages. One emoji per user per message.';

alter table public.message_reactions enable row level security;
alter table public.message_reactions force row level security;

revoke all on table public.message_reactions from public;
revoke all on table public.message_reactions from anon;
grant select, insert, delete on table public.message_reactions to authenticated;
grant all on table public.message_reactions to service_role;

drop policy if exists "message_reactions_select" on public.message_reactions;
create policy "message_reactions_select"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.client_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "message_reactions_insert" on public.message_reactions;
create policy "message_reactions_insert"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.deleted_at is null
        and (m.client_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "message_reactions_delete" on public.message_reactions;
create policy "message_reactions_delete"
  on public.message_reactions for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
  );

-- No UPDATE — toggle by delete + insert / upsert replace via delete-then-insert in app.
revoke update on table public.message_reactions from authenticated;

-- ---------------------------------------------------------------------------
-- Channel / forum reactions
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.conversation_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint conversation_message_reactions_emoji_allowed check (
    emoji in ('❤️', '👍', '👎', '😂', '‼️', '❓')
  ),
  constraint conversation_message_reactions_unique_user unique (message_id, user_id)
);

create index if not exists conversation_message_reactions_message_idx
  on public.conversation_message_reactions (message_id);

create index if not exists conversation_message_reactions_user_idx
  on public.conversation_message_reactions (user_id);

comment on table public.conversation_message_reactions is
  'Tapback reactions on cohort channel messages. One emoji per user per message.';

alter table public.conversation_message_reactions enable row level security;
alter table public.conversation_message_reactions force row level security;

revoke all on table public.conversation_message_reactions from public;
revoke all on table public.conversation_message_reactions from anon;
grant select, insert, delete on table public.conversation_message_reactions to authenticated;
grant all on table public.conversation_message_reactions to service_role;

drop policy if exists "conversation_message_reactions_select" on public.conversation_message_reactions;
create policy "conversation_message_reactions_select"
  on public.conversation_message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.conversation_messages cm
      where cm.id = message_id
        and public.is_active_conversation_member(cm.conversation_id)
    )
  );

drop policy if exists "conversation_message_reactions_insert" on public.conversation_message_reactions;
create policy "conversation_message_reactions_insert"
  on public.conversation_message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.conversation_messages cm
      where cm.id = message_id
        and cm.deleted_at is null
        and cm.kind is distinct from 'system'
        and public.is_active_conversation_member(cm.conversation_id)
    )
  );

drop policy if exists "conversation_message_reactions_delete" on public.conversation_message_reactions;
create policy "conversation_message_reactions_delete"
  on public.conversation_message_reactions for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
  );

revoke update on table public.conversation_message_reactions from authenticated;

-- Realtime so chips update without a full refresh thrash (clients also refresh lists).
do $$ begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversation_message_reactions;
exception when duplicate_object then null;
end $$;
