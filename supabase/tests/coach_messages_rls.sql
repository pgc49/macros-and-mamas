begin;

select plan(16);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_messages'
      and policyname = 'coach_messages_select_own_visible_or_admin'
  ),
  'select is own-visible or is_admin()'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_messages'
      and policyname = 'coach_messages_insert_own_mama'
  ),
  'insert is own mama-role rows only'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_messages'
      and policyname = 'coach_messages_hide_own'
  ),
  'update is the hide-own policy'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_messages'
      and cmd = 'DELETE'
  ),
  'no DELETE policy remains on coach_messages'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'coach-admin@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'coach-mama-one@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'coach-mama-two@example.com');

insert into public.profiles (id, email, name, role, status)
values
  ('00000000-0000-0000-0000-0000000000a1', 'coach-admin@example.com', 'Admin', 'admin', 'active'),
  ('00000000-0000-0000-0000-0000000000a2', 'coach-mama-one@example.com', 'Mama One', 'client', 'active'),
  ('00000000-0000-0000-0000-0000000000a3', 'coach-mama-two@example.com', 'Mama Two', 'client', 'active');

-- Seed as table owner so the coach-role row exists before RLS is tested.
insert into public.coach_messages (id, profile_id, role, body, kind)
values
  (
    '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-0000000000a2',
    'coach',
    'Chicken bowl tonight.',
    'text'
  ),
  (
    '00000000-0000-0000-0000-0000000000c2',
    '00000000-0000-0000-0000-0000000000a3',
    'mama',
    'what should I eat',
    'text'
  );

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$insert into public.coach_messages (profile_id, role, body, kind)
    values ('00000000-0000-0000-0000-0000000000a2', 'mama', 'what should I eat', 'text')$$,
  'mama can insert her own mama-role row'
);

select throws_ok(
  $$insert into public.coach_messages (profile_id, role, body, kind)
    values ('00000000-0000-0000-0000-0000000000a2', 'coach', 'forged coach line', 'text')$$,
  '42501',
  null,
  'mama session cannot insert a coach-role row'
);

select throws_ok(
  $$insert into public.coach_messages (profile_id, role, body, kind)
    values ('00000000-0000-0000-0000-0000000000a3', 'mama', 'not my thread', 'text')$$,
  '42501',
  null,
  'mama cannot insert into another mama thread'
);

select is(
  (select count(*)::integer from public.coach_messages
    where profile_id = '00000000-0000-0000-0000-0000000000a3'),
  0,
  'mama cannot read another mama coach_messages'
);

select ok(
  exists (
    select 1 from public.coach_messages
    where id = '00000000-0000-0000-0000-0000000000c1'
  ),
  'mama can read her own visible coach row'
);

select lives_ok(
  $$update public.coach_messages
      set hidden_at = '2026-10-08T12:00:00Z'::timestamptz
    where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'mama can hide her own coach-role row'
);

select is(
  (select count(*)::integer from public.coach_messages
    where id = '00000000-0000-0000-0000-0000000000c1'),
  0,
  'hidden row disappears from the mama select'
);

select throws_ok(
  $$update public.coach_messages
      set hidden_at = null
    where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501',
  null,
  'mama cannot un-hide: she can no longer select the row'
);

reset role;
select ok(
  exists (
    select 1 from public.coach_messages
    where id = '00000000-0000-0000-0000-0000000000c1'
      and hidden_at is not null
  ),
  'mama cannot un-hide: hidden_at stays set'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_ok(
  $$delete from public.coach_messages
    where profile_id = '00000000-0000-0000-0000-0000000000a2'$$,
  '42501',
  null,
  'mama cannot hard-delete coach_messages'
);

select throws_ok(
  $$update public.coach_messages
      set role = 'coach'
    where profile_id = '00000000-0000-0000-0000-0000000000a2'
      and role = 'mama'$$,
  'P0001',
  'coach_messages are append-only except hidden_at',
  'mama cannot update a row into a coach-role row'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select count(*)::integer from public.coach_messages
    where profile_id = '00000000-0000-0000-0000-0000000000a2'
      and hidden_at is not null),
  1,
  'admin is_admin() read includes rows she hid'
);

select is(
  (select count(*)::integer from public.coach_messages
    where profile_id = '00000000-0000-0000-0000-0000000000a3'),
  1,
  'admin can read another mama thread'
);

select * from finish();
rollback;
