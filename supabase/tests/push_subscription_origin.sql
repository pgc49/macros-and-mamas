begin;

select plan(5);

select has_column(
  'public',
  'push_subscriptions',
  'app_origin',
  'push subscription records registering origin'
);
select has_column(
  'public',
  'push_subscriptions',
  'last_seen_at',
  'push subscription records last-seen time'
);
select has_index(
  'public',
  'push_subscriptions',
  'push_subscriptions_profile_origin_idx',
  'push origin cleanup is indexed'
);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000041', 'push-origin@example.com');
insert into public.profiles (id, email, name, role, status)
values (
  '00000000-0000-0000-0000-000000000041',
  'push-origin@example.com',
  'Push Admin',
  'admin',
  'active'
);

select lives_ok(
  $$
    insert into public.push_subscriptions (
      profile_id, endpoint, p256dh, auth, app_origin
    ) values (
      '00000000-0000-0000-0000-000000000041',
      'https://push.example/one',
      'key',
      'auth',
      'https://admin.macrosandmamas.com'
    )
  $$,
  'HTTPS admin origin is accepted'
);

select throws_ok(
  $$
    insert into public.push_subscriptions (
      profile_id, endpoint, p256dh, auth, app_origin
    ) values (
      '00000000-0000-0000-0000-000000000041',
      'https://push.example/two',
      'key',
      'auth',
      'ftp://unsafe.example.com'
    )
  $$,
  '23514',
  null,
  'unsafe push origin is rejected'
);

select * from finish();
rollback;

