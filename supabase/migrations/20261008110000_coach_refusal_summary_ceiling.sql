-- ==================================================================
-- 20261008110000_coach_refusal_summary_ceiling.sql
-- 20261008100000 is live (Oct 7, 11:44pm PT). Do not edit it.
-- Add-only: replace append_coach_refusal_line. Same signature.
-- Ceiling 8000. Trim prose only. Never drop a Coach refused line.
-- Do not apply live until Patrick says so.
-- No drops. No table changes. No row rewrites.
-- ==================================================================

create or replace function public.append_coach_refusal_line(
  p_profile_id uuid,
  p_for_date date,
  p_line text,
  p_door text,
  p_max integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_summary text;
  existing_touch text;
  existing_model text;
  has_row boolean;
  n integer;
  parts text[];
  drop_idx integer;
  i integer;
  trimmed integer := 0;
  next_summary text;
begin
  p_line := left(btrim(p_line), 300);
  if p_profile_id is null or nullif(p_line, '') is null or nullif(btrim(p_door), '') is null then
    return jsonb_build_object('ok', false, 'skipped', true);
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_profile_id::text || ':coach_refusal:' || p_for_date::text)
  );

  select true, summary, suggested_touch, model
    into has_row, existing_summary, existing_touch, existing_model
    from public.client_summaries
   where profile_id = p_profile_id
     and for_date = p_for_date
   for update;

  -- Whole-line equality. "message 1" must not match "message 10".
  if coalesce(has_row, false)
     and exists (
       select 1
         from regexp_split_to_table(coalesce(existing_summary, ''), E'\n') as line
        where line = p_line
     )
  then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  select count(*)::integer
    into n
    from regexp_split_to_table(coalesce(existing_summary, ''), E'\n') as line
   where line like ('Coach refused (' || p_door || '):%');

  if p_max is not null and n >= p_max then
    return jsonb_build_object('ok', true, 'capped', true);
  end if;

  if nullif(btrim(coalesce(existing_summary, '')), '') is null then
    parts := array[p_line];
  else
    parts := string_to_array(existing_summary, E'\n') || p_line;
  end if;

  -- Safety net only. Drop summary prose from the front. Never drop a
  -- Coach refused line (crisis, medical, or stuck). If the line that
  -- would be dropped is the new line, or only refused lines remain
  -- and it still cannot fit, refuse the write.
  while char_length(array_to_string(parts, E'\n')) > 8000 loop
    drop_idx := null;
    for i in 1 .. coalesce(array_length(parts, 1), 0) loop
      if parts[i] not like 'Coach refused (%' then
        drop_idx := i;
        exit;
      end if;
    end loop;
    if drop_idx is null then
      return jsonb_build_object('ok', false, 'reason', 'full');
    end if;
    if parts[drop_idx] = p_line then
      return jsonb_build_object('ok', false, 'reason', 'full');
    end if;
    parts := parts[1:drop_idx - 1] || parts[drop_idx + 1:array_length(parts, 1)];
    trimmed := trimmed + 1;
  end loop;

  if p_line <> all (parts) then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  next_summary := array_to_string(parts, E'\n');

  insert into public.client_summaries as cs (profile_id, for_date, summary, suggested_touch, model)
  values (p_profile_id, p_for_date, next_summary, existing_touch, existing_model)
  on conflict (profile_id, for_date) do update
    set summary = excluded.summary;

  if trimmed > 0 then
    return jsonb_build_object('ok', true, 'trimmed', trimmed);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.append_coach_refusal_line(uuid, date, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.append_coach_refusal_line(uuid, date, text, text, integer)
  to service_role;

comment on function public.append_coach_refusal_line(uuid, date, text, text, integer) is
  'Atomic append of one Coach refused line. Whole-line dedupe. Caps by door. Ceiling 8000. Trims prose only.';
