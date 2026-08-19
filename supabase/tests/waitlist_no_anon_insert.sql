begin;

select plan(5);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'waitlist'
      and policyname = 'waitlist_insert_public'
  ),
  'waitlist_insert_public policy is dropped'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'waitlist'
      and policyname = 'waitlist_select_admin'
  ),
  'admin select policy on waitlist remains'
);

set role anon;
select throws_ok(
  $$insert into public.waitlist (email, reason) values ('anon@example.com', 'pregnant')$$,
  '42501',
  null,
  'anon cannot insert into public.waitlist'
);
reset role;

set role authenticated;
select throws_ok(
  $$insert into public.waitlist (email, reason) values ('auth@example.com', 'early_nursing')$$,
  '42501',
  null,
  'authenticated cannot insert into public.waitlist'
);
reset role;

select lives_ok(
  $$insert into public.waitlist (email, reason) values ('svc@example.com', 'pregnant')$$,
  'postgres / service role can still insert'
);

select * from finish();
rollback;
