-- 061_voice_drop_cohort_label.sql
-- Scope Monday voice drops to one cohort so Founding PSAs skip C2.

alter table public.voice_drops
  add column if not exists cohort_label text;

comment on column public.voice_drops.cohort_label is
  'When audience=active, only this cohort sees/gets notified. Null = legacy all-actives.';

drop policy if exists "voice_drops_select_audience" on public.voice_drops;
create policy "voice_drops_select_audience"
  on public.voice_drops for select to authenticated
  using (
    status = 'published'
    and expires_at > now()
    and (
      public.is_admin()
      or (
        audience = 'active'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and coalesce(p.refunded, false) = false
            and p.status = 'active'
            and (
              voice_drops.cohort_label is null
              or voice_drops.cohort_label = p.cohort_label
            )
        )
      )
      or (
        audience = 'all_mamas'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and coalesce(p.refunded, false) = false
            and coalesce(p.role, '') <> 'admin'
        )
      )
    )
  );
