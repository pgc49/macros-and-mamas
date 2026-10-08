begin;

select plan(32);

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
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_messages'
      and cmd = 'UPDATE'
  ),
  'no UPDATE policy remains on coach_messages'
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

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'hide_coach_messages'
      and p.prosecdef
  ),
  'hide_coach_messages is SECURITY DEFINER'
);

select ok(
  has_function_privilege('authenticated', 'public.hide_coach_messages(uuid[])', 'execute'),
  'authenticated can execute hide_coach_messages'
);

select ok(
  not has_function_privilege('anon', 'public.hide_coach_messages(uuid[])', 'execute'),
  'anon cannot execute hide_coach_messages'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'clear_coach_messages'
      and p.prosecdef
  ),
  'clear_coach_messages is SECURITY DEFINER'
);

select ok(
  has_function_privilege('authenticated', 'public.clear_coach_messages()', 'execute'),
  'authenticated can execute clear_coach_messages'
);

select ok(
  not has_function_privilege('anon', 'public.clear_coach_messages()', 'execute'),
  'anon cannot execute clear_coach_messages'
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

insert into public.coach_messages (id, profile_id, role, body, kind, source)
values
  (
    '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-0000000000a2',
    'coach',
    'Chicken bowl tonight.',
    'text',
    'server'
  ),
  (
    '00000000-0000-0000-0000-0000000000c2',
    '00000000-0000-0000-0000-0000000000a3',
    'mama',
    'what should I eat',
    'text',
    'server'
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

insert into public.coach_messages (
  id, profile_id, role, body, kind, hidden_at, created_at, seq, source
) values (
  '00000000-0000-0000-0000-0000000000c3',
  '00000000-0000-0000-0000-0000000000a2',
  'mama',
  'trying to pre-hide',
  'text',
  '2020-01-01T00:00:00Z',
  '2020-01-01T00:00:00Z',
  1,
  'server'
);

select ok(
  exists (
    select 1 from public.coach_messages
    where id = '00000000-0000-0000-0000-0000000000c3'
      and hidden_at is null
      and created_at > now() - interval '1 minute'
      and seq is distinct from 1
  ),
  'insert trigger forces hidden_at null and server created_at/seq'
);

select is(
  (select source from public.coach_messages
    where id = '00000000-0000-0000-0000-0000000000c3'),
  'client',
  'mama insert can never produce source=server'
);

select throws_ok(
  $$insert into public.coach_messages (profile_id, role, body, kind)
    values ('00000000-0000-0000-0000-0000000000a2', 'mama', 'forged pin', 'deflect')$$,
  'P0001',
  'mama coach_messages kind must be text or photo',
  'mama cannot insert kind=deflect'
);

select throws_ok(
  $$insert into public.coach_messages (profile_id, role, body, kind, payload)
    values (
      '00000000-0000-0000-0000-0000000000a2',
      'mama',
      'forged pin',
      'text',
      '{"deflect":"again"}'::jsonb
    )$$,
  'P0001',
  'mama coach_messages payload must be empty',
  'mama cannot insert a payload'
);

select is(
  public.hide_coach_messages(array['00000000-0000-0000-0000-0000000000c1']::uuid[]),
  1,
  'RPC hides her own coach-role row'
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
  'mama cannot un-hide: no UPDATE policy'
);

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
  '42501',
  null,
  'mama cannot update a row into a coach-role row'
);

select is(
  public.hide_coach_messages(array['00000000-0000-0000-0000-0000000000c2']::uuid[]),
  0,
  'RPC cannot hide another mama''s rows'
);

select is(
  public.hide_coach_messages(array[]::uuid[]),
  0,
  'empty hide_coach_messages hides nothing'
);

select ok(
  public.clear_coach_messages() >= 1,
  'clear_coach_messages hides her own remaining rows'
);

set local role anon;
select throws_ok(
  $$select public.hide_coach_messages(array[]::uuid[])$$,
  '42501',
  null,
  'anon execute of hide_coach_messages is denied'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select count(*)::integer from public.coach_messages
    where id = '00000000-0000-0000-0000-0000000000c1'
      and hidden_at is not null),
  1,
  'admin is_admin() read includes rows she hid'
);

select is(
  (select count(*)::integer from public.coach_messages
    where profile_id = '00000000-0000-0000-0000-0000000000a3'
      and hidden_at is null),
  1,
  'admin can read another mama thread'
);

reset role;
select throws_ok(
  $$update public.coach_messages
      set id = '00000000-0000-0000-0000-0000000000ff'
    where id = '00000000-0000-0000-0000-0000000000c2'$$,
  'P0001',
  'coach_messages are append-only except hidden_at',
  'trigger freezes id on a service-role/owner update'
);

select throws_ok(
  $$update public.coach_messages
      set source = 'server'
    where id = '00000000-0000-0000-0000-0000000000c2'$$,
  'P0001',
  'coach_messages are append-only except hidden_at',
  'trigger freezes source on a service-role/owner update'
);

select * from finish();
rollback;
