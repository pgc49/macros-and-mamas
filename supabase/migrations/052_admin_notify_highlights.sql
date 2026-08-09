-- Admins were seeded with notify_level=all so Callie/Patrick always got every
-- peer post. Product default is highlights for everyone (including admins);
-- they can switch to All in the UI if they want the firehose.

update public.conversation_members m
set notify_level = 'highlights'
from public.profiles p
where m.user_id = p.id
  and p.role = 'admin'
  and m.notify_level = 'all';
