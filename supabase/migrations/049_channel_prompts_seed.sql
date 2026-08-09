-- Seed weekly wins prompt for Founding Members (safe to re-run).
insert into public.channel_prompts (conversation_id, body, cadence, active)
select c.id, 'Wins from this week — go.', 'weekly', true
from public.conversations c
where c.cohort_label = '2026-07'
  and not exists (
    select 1 from public.channel_prompts p where p.conversation_id = c.id
  );
