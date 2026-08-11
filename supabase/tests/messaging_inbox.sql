begin;

select plan(9);

select has_function(
  'public',
  'load_admin_message_inbox',
  array[]::text[],
  'admin inbox RPC exists'
);

select has_index(
  'public',
  'messages',
  'messages_client_created_id_idx',
  'DM ordering index exists'
);

select has_index(
  'public',
  'conversation_messages',
  'conversation_messages_conversation_created_id_idx',
  'channel ordering index exists'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'admin-test@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'mama-one@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'mama-two@example.com');

insert into public.profiles (id, email, name, role, status)
values
  ('00000000-0000-0000-0000-000000000001', 'admin-test@example.com', 'Admin', 'admin', 'active'),
  ('00000000-0000-0000-0000-000000000002', 'mama-one@example.com', 'Mama One', 'client', 'active'),
  ('00000000-0000-0000-0000-000000000003', 'mama-two@example.com', 'Mama Two', 'client', 'active');

-- More than the legacy global 500-row inbox window.
insert into public.messages (client_id, sender_id, body, created_at, read_at)
select
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'bulk ' || n,
  '2026-08-01 00:00:00+00'::timestamptz + (n || ' seconds')::interval,
  '2026-08-01 01:00:00+00'::timestamptz
from generate_series(1, 510) n;

insert into public.messages (
  id, client_id, sender_id, body, created_at, read_at
)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000003',
  'quiet thread still present',
  '2026-07-01 00:00:00+00',
  null
);

insert into public.messages (
  id, client_id, sender_id, body, created_at, read_at
)
values (
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002',
  'one unread inbound',
  '2026-08-10 10:00:00+00',
  null
);

insert into public.messages (
  id, client_id, sender_id, body, created_at, read_at, deleted_at
)
values (
  '10000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '',
  '2026-08-10 10:01:00+00',
  null,
  '2026-08-10 10:02:00+00'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::integer from public.load_admin_message_inbox()),
  2,
  'all threads remain in inbox beyond 500 total messages'
);

select is(
  (
    select last_message->>'id'
    from public.load_admin_message_inbox()
    where client_id = '00000000-0000-0000-0000-000000000002'
  ),
  '10000000-0000-0000-0000-000000000003',
  'latest deletion tombstone remains latest activity'
);

select is(
  (
    select unread::integer
    from public.load_admin_message_inbox()
    where client_id = '00000000-0000-0000-0000-000000000002'
  ),
  1,
  'only unread mama-to-admin messages count'
);

select ok(
  exists (
    select 1
    from public.load_admin_message_inbox()
    where client_id = '00000000-0000-0000-0000-000000000003'
      and last_message->>'id' = '10000000-0000-0000-0000-000000000001'
  ),
  'quiet thread remains visible'
);

select ok(
  (
    select participant_ids @> array[
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid
    ]
    from public.load_admin_message_inbox()
    where client_id = '00000000-0000-0000-0000-000000000002'
  ),
  'participant IDs include admin and mama'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

select throws_ok(
  'select * from public.load_admin_message_inbox()',
  '42501',
  'admin required',
  'non-admin cannot load the admin inbox'
);

select * from finish();

rollback;

