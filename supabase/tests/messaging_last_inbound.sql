begin;

select plan(6);

select has_column(
  'public',
  'conversation_members',
  'last_inbound_at',
  'membership carries last inbound timestamp'
);

select has_function(
  'public',
  'touch_conversation_last_inbound',
  'inbound touch function exists'
);

insert into auth.users (id, email)
values
  ('20000000-0000-0000-0000-000000000001', 'inbound-admin@example.com'),
  ('20000000-0000-0000-0000-000000000002', 'inbound-mama@example.com');

insert into public.profiles (id, email, name, role, status)
values
  ('20000000-0000-0000-0000-000000000001', 'inbound-admin@example.com', 'Callie', 'admin', 'active'),
  ('20000000-0000-0000-0000-000000000002', 'inbound-mama@example.com', 'Mama', 'client', 'active');

insert into public.conversations (id, type, label)
values ('30000000-0000-0000-0000-000000000001', 'cohort', 'August Group');

-- last_read_at must be earlier than the fixture message times. `now()` made
-- test 6 fail on main: CI ran after 12:05 UTC on 2026-09-05, so the 12:05
-- inbound was already "read" and last_inbound_at > last_read_at was false.
insert into public.conversation_members (conversation_id, user_id, last_read_at)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-09-05 11:00:00+00'),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '2026-09-05 11:00:00+00');

insert into public.conversation_messages (
  conversation_id, sender_id, body, created_at
)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'hello group',
  '2026-09-05 12:00:00+00'
);

select is(
  (
    select last_inbound_at
    from public.conversation_members
    where conversation_id = '30000000-0000-0000-0000-000000000001'
      and user_id = '20000000-0000-0000-0000-000000000002'
  ),
  '2026-09-05 12:00:00+00'::timestamptz,
  'recipient last_inbound_at moves on insert'
);

select is(
  (
    select last_inbound_at
    from public.conversation_members
    where conversation_id = '30000000-0000-0000-0000-000000000001'
      and user_id = '20000000-0000-0000-0000-000000000001'
  ),
  null,
  'sender last_inbound_at is not stamped'
);

insert into public.conversation_messages (
  conversation_id, sender_id, body, created_at
)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'reply',
  '2026-09-05 12:05:00+00'
);

select is(
  (
    select last_inbound_at
    from public.conversation_members
    where conversation_id = '30000000-0000-0000-0000-000000000001'
      and user_id = '20000000-0000-0000-0000-000000000001'
  ),
  '2026-09-05 12:05:00+00'::timestamptz,
  'Callie last_inbound_at moves when a mama posts'
);

select ok(
  (
    select last_inbound_at > last_read_at
    from public.conversation_members
    where conversation_id = '30000000-0000-0000-0000-000000000001'
      and user_id = '20000000-0000-0000-0000-000000000001'
  ),
  'inbound after last_read is unread'
);

select * from finish();

rollback;
