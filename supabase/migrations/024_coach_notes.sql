-- ==================================================================
-- 024_coach_notes.sql
-- Callie → mama private note on Today (dismissible).
-- Non-admins cannot change coach_note / coach_note_at (trigger lock).
-- ==================================================================

alter table public.profiles
  add column if not exists coach_note text,
  add column if not exists coach_note_at timestamptz,
  add column if not exists coach_note_dismissed_at timestamptz;

comment on column public.profiles.coach_note is
  'Private note from Callie shown on mama Today dashboard until dismissed.';
comment on column public.profiles.coach_note_at is
  'When Callie last saved coach_note — used to re-show after a new note.';
comment on column public.profiles.coach_note_dismissed_at is
  'When mama dismissed the note. Hidden while dismissed_at >= coach_note_at.';

create or replace function public.protect_payment_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  new.paid := old.paid;
  new.refunded := old.refunded;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_payment_intent := old.stripe_payment_intent;
  new.paid_at := old.paid_at;
  new.role := old.role;
  if new.status is distinct from old.status and new.status = 'active' then
    new.status := old.status;
  end if;

  -- Only Callie/admin may author or clear the coach note body/timestamp.
  new.coach_note := old.coach_note;
  new.coach_note_at := old.coach_note_at;
  return new;
end;
$$;
