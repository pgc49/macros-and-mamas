# Stage 5 — Smart goals: auto-check + custom goals (FULL BUILD SPEC)
Read README.md first. PRIORITY NOTE: stages 0–3 carry hard August deadlines; this stage jumps the queue only if Patrick says so. Independent of billing/referral/channel work — safe to build in parallel if agent bandwidth allows.
VISUAL REFERENCE: smart-goals-mockup.html (drop it in the repo, e.g. /design/). The mockup is the approved UX; this file is the source of truth where they differ.

## 5.0 Current state to migrate
The Today tab has a weekly goals card: week header with prev/next arrows ("Week 3 · Aug 3 – Aug 9 · this week"), hint line, six goal rows each with M T W T F S S tap circles (today ringed), "Week so far: X% — progress, not perfection." footer, and a green tip box below the card. Weeks run Mon–Sun. Determine how current goals/checks are stored (hardcoded vs DB) and migrate to the model below, preserving all historical checks.

## 5.1 Data model
```
goals
  id, user_id, title text, subtitle text nullable ('· 88 oz'),
  type enum('auto_macro','auto_water','manual'),
  frequency enum('daily','n_per_week'), n_target int nullable,
  source enum('program','custom'), sort int,
  active bool default true, created_at, archived_at nullable

goal_checks
  id, goal_id, date, checked bool,
  checked_by enum('user','system'), updated_at
  UNIQUE(goal_id, date)

water_logs   -- only if no water logging exists (see 5.3)
  id, user_id, date, oz int, updated_at
  UNIQUE(user_id, date)
```
- Program-goal migration per member: macros → auto_macro; water → auto_water; steps/walks, sunlight, meals-at-home → manual daily; strength → manual n_per_week (n_target=3).
- RLS: owner read/write own goal rows and checks (manual only — see 5.4), water_logs owner read/write; admin read all.

## 5.2 Auto-check engine (auto_macro)
- IN-RANGE DEFINITION: config, not hardcoded. DEFAULT (pending Callie's confirmation): calories in range AND protein in range = day checks. Config shape: `macro_check_rule: ['cal','protein']` — extensible to all four.
- Recompute triggers:
  1. Any meal-log write/delete for date D → recompute D's auto_macro check for that user.
  2. Nightly scheduled function at member-local midnight (store timezone on profile; default America/Los_Angeles if absent) finalizes the closing day.
  3. Retro edits: recomputes that historical day; week % for that week updates.
- Writes go to goal_checks with checked_by='system'. System never overwrites a manual goal; user taps never write to auto goals (enforce server-side, not just UI).

## 5.3 Water (auto_water)
- FIRST: check whether water logging already exists in the app. If YES → auto_water recomputes from it exactly like 5.2 (threshold = 88 oz or the member's configured target).
- If NO (assumed default): the goal row IS the logger. Tapping today's circle opens the water stepper sheet (5.6). Writes upsert water_logs for today; reaching target sets goal_checks checked_by='system' immediately (live, no nightly wait). Tapping a past day opens the past-day sheet (read-only explanation) — v1 does not allow retro water entry.

## 5.4 Interaction rules (server-enforced, not just UI)
- Manual goal circle tap → toggle that day, checked_by='user'. Any day in the current week is tappable; future days within the week are not (reject date > today).
- Auto goal circles NEVER toggle on tap:
  - auto_macro today → macro sheet (5.6) with live totals + "Open Meals" deep link.
  - auto_water today → water stepper sheet.
  - any past auto day → past-day sheet ("Auto days follow the log — fix that day's log and the circle updates on its own." + Open Meals).
- Week % math (matches mockup): per goal, completion = min(checks_this_week / target, 1) where target = 7 for daily, n_target for n_per_week; week % = round(average across active goals × 100). Custom goal added mid-week: target = remaining days in week including add day (daily) or n_target (n_per_week).

## 5.5 Custom goals
- "+ Add your own · X of 3 used" row pinned below the last goal, above the footer. Cap 3 active custom goals; at cap, tapping explains archiving.
- Add sheet fields: GOAL NAME (30 chars, required), TARGET NOTE (20 chars, optional, rendered as subtitle), HOW OFTEN pills: Daily / 3× a week / 5× a week (maps to frequency + n_target).
- Guardrail copy in the form, VERBATIM: "Goals here should add to your life — more water, more walks, more protein. Nothing restrictive. That's not how we do it. 🤍"
- All custom goals are type='manual'.
- EDIT/REMOVE (custom goals only): tapping a custom goal's title row (marked with the YOURS chip + a small ✎) opens the edit sheet — same fields as creation (name, note, frequency) plus a destructive-styled "Remove goal" button. Remove requires a second tap to confirm, with copy "Tap again to remove — history stays saved." Remove = archive semantics: sets archived_at, preserves goal_checks history, frees a cap slot.
- Frequency edits apply to the current week immediately: target recalculates (daily=7, n_per_week=n), historical checks untouched, week % recomputes.
- Program goals are LOCKED for members: title taps do nothing, no edit or remove. Callie's goals are the methodology; if one genuinely doesn't fit a member, that's a coaching conversation, not a settings toggle. (Admin-side program-goal editing is future work, out of scope.)
- ADMIN: member view in admin lists custom goals (title, note, created). This is a coaching signal — no automated content filtering in v1.

## 5.6 UI components (all shown in the mockup)
- Goal title row: bold title, muted subtitle, then chip: auto goals get plum-soft "✨ AUTO"; custom goals get lavender "YOURS"; program manual goals get none. n_per_week goals show "X of N this week" inline count.
- Auto goals show a one-line live status under the title: macro "Auto · in range X of Y days so far"; water "Auto · today: X / 88 oz".
- Auto-checked circles get a tiny dot beneath (subtle system-vs-user distinction).
- Bottom sheets (dim overlay, rounded top, plum primary button, ghost secondary):
  1. Macro sheet: title "This one checks itself ✨"; body shows live totals ("You're at 1,420 cal · P 96g so far today. Log the rest of your day — when it lands in range, this checks off on its own."); macro stat pills (in-range pills green); buttons Open Meals / Got it.
  2. Water stepper: big "X / 88 oz today", progress bar, +8 / +16 / +24 oz buttons, success state "88 oz — checked off for today 🎉", Done.
  3. Past-day sheet: title "Auto days follow the log"; buttons Open Meals / Got it.
  4. Add-goal sheet per 5.5.
- Hint line under the week header updates to: "Tap the days as you go. Goals marked auto check themselves from your log."

## OUT OF SCOPE
Step/HealthKit integration (impossible in PWA), streaks/badges (guilt mechanics, off-brand — do not add even if trivial), goal sharing to channels, coach-assigned per-member goals, retroactive water entry, editing program goals.

## Acceptance checklist
- [ ] Migration: existing goals appear identically for a C1 member, history intact, before any new behavior ships.
- [ ] Logging a day into range (per config rule) auto-checks macros; deleting a meal that drops it out un-checks — same day and retroactively; week % updates.
- [ ] Config flip of macro_check_rule changes evaluation without code changes.
- [ ] Nightly finalize respects member-local midnight.
- [ ] Server rejects: user toggle on an auto goal; system write on a manual goal; future-day manual toggle.
- [ ] Water stepper: reaching 88 oz checks today live; reopening shows persisted oz; past water days open the explainer, not the stepper.
- [ ] Macro sheet shows live totals with correct in/out-of-range pill states; Open Meals deep-links.
- [ ] Custom goal: add mid-week → target = remaining days; appears with YOURS chip + ✎; cap 3 enforced with explainer.
- [ ] Edit sheet: rename, note, and frequency changes persist; frequency change recalculates current-week target and week %.
- [ ] Remove: requires two-tap confirm; archived goal disappears, frees cap slot, goal_checks history intact in DB; re-adding a same-named goal creates a NEW goal, no history resurrection.
- [ ] Program goal title taps do nothing; server rejects edit/archive attempts on source='program' goals.
- [ ] Custom goals visible in admin member view.
- [ ] Week % math matches 5.4 for daily, n_per_week, and mid-week-added goals.
- [ ] RLS: member cannot read another member's goals/checks/water; client cannot write system checks.
