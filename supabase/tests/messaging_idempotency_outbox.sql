begin;

select plan(12);

select has_column('public', 'messages', 'client_message_id', 'DM idempotency column exists');
select has_column(
  'public',
  'conversation_messages',
  'client_message_id',
  'channel idempotency column exists'
);
select has_index(
  'public',
  'messages',
  'messages_sender_client_message_uidx',
  'DM idempotency unique index exists'
);
select has_index(
  'public',
  'conversation_messages',
  'conversation_messages_sender_client_message_uidx',
  'channel idempotency unique index exists'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000011', 'outbox-admin@example.com'),
  ('00000000-0000-0000-0000-000000000012', 'outbox-mama@example.com');

insert into public.profiles (id, email, name, role, status)
values
  ('00000000-0000-0000-0000-000000000011', 'outbox-admin@example.com', 'Admin', 'admin', 'active'),
  ('00000000-0000-0000-0000-000000000012', 'outbox-mama@example.com', 'Mama', 'client', 'active');

insert into public.messages (
  id, client_id, sender_id, client_message_id, body
)
values (
  '10000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000011',
  '20000000-0000-4000-8000-000000000011',
  'idempotent DM'
);

select is(
  (
    select count(*)::integer
    from public.message_notification_outbox
    where message_type = 'dm'
      and message_id = '10000000-0000-0000-0000-000000000011'
  ),
  1,
  'DM insert transactionally enqueues one notification'
);

select throws_ok(
  $$
    insert into public.messages (
      client_id, sender_id, client_message_id, body
    )
    values (
      '00000000-0000-0000-0000-000000000012',
      '00000000-0000-0000-0000-000000000011',
      '20000000-0000-4000-8000-000000000011',
      'duplicate DM'
    )
  $$,
  '23505',
  null,
  'same sender idempotency key cannot create a second DM'
);

update public.messages
set client_message_id = '20000000-0000-4000-8000-000000000099'
where id = '10000000-0000-0000-0000-000000000011';

select is(
  (
    select client_message_id::text
    from public.messages
    where id = '10000000-0000-0000-0000-000000000011'
  ),
  '20000000-0000-4000-8000-000000000011',
  'DM idempotency key is immutable'
);

insert into public.conversation_messages (
  id, conversation_id, sender_id, client_message_id, body
)
values (
  '10000000-0000-0000-0000-000000000012',
  '30000000-0000-4000-8000-000000000012',
  '00000000-0000-0000-0000-000000000011',
  '20000000-0000-4000-8000-000000000012',
  'idempotent channel message'
);

select is(
  (
    select count(*)::integer
    from public.message_notification_outbox
    where message_type = 'channel'
      and message_id = '10000000-0000-0000-0000-000000000012'
  ),
  1,
  'channel insert transactionally enqueues one notification'
);

select ok(
  not has_table_privilege('authenticated', 'public.message_notification_outbox', 'SELECT'),
  'authenticated clients cannot read the outbox'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_message_notification_job(text,uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot claim notification jobs'
);

set local role service_role;

select is(
  (
    select status
    from public.claim_message_notification_job(
      'dm',
      '10000000-0000-0000-0000-000000000011'
    )
  ),
  'processing',
  'service role can atomically claim a due job'
);

select is(
  (
    select attempts
    from public.message_notification_outbox
    where message_type = 'dm'
      and message_id = '10000000-0000-0000-0000-000000000011'
  ),
  1,
  'claim increments attempt count'
);

reset role;

select * from finish();

rollback;

