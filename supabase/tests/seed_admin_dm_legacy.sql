insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000051', 'legacy-admin-a@example.com'),
  ('00000000-0000-0000-0000-000000000052', 'legacy-admin-b@example.com');

insert into public.profiles (id, email, name, role, status)
values
  ('00000000-0000-0000-0000-000000000051', 'legacy-admin-a@example.com', 'Admin A', 'admin', 'active'),
  ('00000000-0000-0000-0000-000000000052', 'legacy-admin-b@example.com', 'Admin B', 'admin', 'active');

insert into public.messages (
  client_id, sender_id, body, created_at,
  attachment_path, attachment_name, attachment_mime, attachment_bytes
)
select
  '00000000-0000-0000-0000-000000000051',
  case when n % 2 = 0
    then '00000000-0000-0000-0000-000000000051'::uuid
    else '00000000-0000-0000-0000-000000000052'::uuid
  end,
  'legacy-a-' || n,
  '2026-07-28T00:00:00Z'::timestamptz + (n || ' minutes')::interval,
  case when n = 1
    then '00000000-0000-0000-0000-000000000051/legacy-a.pdf'
    else null
  end,
  case when n = 1 then 'legacy-a.pdf' else null end,
  case when n = 1 then 'application/pdf' else null end,
  case when n = 1 then 101 else null end
from generate_series(1, 5) n;

insert into public.messages (
  client_id, sender_id, body, created_at,
  attachment_path, attachment_name, attachment_mime, attachment_bytes
)
select
  '00000000-0000-0000-0000-000000000052',
  case when n % 2 = 0
    then '00000000-0000-0000-0000-000000000052'::uuid
    else '00000000-0000-0000-0000-000000000051'::uuid
  end,
  'legacy-b-' || n,
  '2026-07-29T00:00:00Z'::timestamptz + (n || ' minutes')::interval,
  case when n in (1, 2)
    then '00000000-0000-0000-0000-000000000052/legacy-b-' || n || '.pdf'
    else null
  end,
  case when n in (1, 2) then 'legacy-b-' || n || '.pdf' else null end,
  case when n in (1, 2) then 'application/pdf' else null end,
  case when n in (1, 2) then 100 + n else null end
from generate_series(1, 46) n;

update public.messages child
set reply_to_id = parent.id
from public.messages parent
where child.body = 'legacy-b-3'
  and parent.body = 'legacy-b-1';

insert into public.message_reactions (message_id, user_id, emoji)
select id, '00000000-0000-0000-0000-000000000052', '❤️'
from public.messages where body = 'legacy-a-1';

