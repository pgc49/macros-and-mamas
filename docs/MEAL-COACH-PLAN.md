# Meal coach — build plan

**For:** Cursor agent. This is the single source of truth. It replaces `help-me-decide-BUILD.md`, `help-me-decide-brief.md`, `help-me-decide-cursor-response.md`, and `meal-coach-BUILD.md`. Nothing in those files is in scope unless it appears here.
**Reference:** `macros-mamas-coach-full-mockup.html` (open at phone width; it is the visual spec).
**Grounded in:** your three Q&A files (section 14, Messages/time zone, meal-log edits). Tables, files, and shapes named here come from your answers. If the repo disagrees, the repo wins and you say so in the PR.
**Owners:** Patrick (product), Callie (principles, copy, handoff behavior).

## 0. Decisions already made

- **This is a brand-new PR.** Archive the Help me decide PR and its branch. Do not carry its UI or commits forward. Branch fresh from `main`.
- **PR 330 is live and stays.** Do not rebuild the filter. `mealFitsRemaining`, `filterMealsByRemaining`, `remainingAfterMeal`, `mealMacros`, `roomLeftFromTotals` in `src/utils/eatingOutImpact.js` are the fit layer for everything below.
- **Help me decide as a standalone sheet is scrapped.** No `DecideSheet.jsx`, no bottom sheet on Today. Any branch started for it is abandoned.
- **Meal coach gets its own tab.** Five tabs: Today · Meals · Coach · Progress · Messages. Messages stays people-only (Callie DMs, group). The coach writes to `messages` in exactly one case: a handoff to Callie.
- **Today gets a Meal coach block under the log items**, not a new logging tile.
- **All writes are made by the mama's client, never by the server.** The coach API returns text and payloads; buttons in the app call the existing `appendMealEntry` / `updateMealEntry` / `saveCustomMeal` / plan write. This avoids the stale-`todayLog` problem you described and keeps every log on the paths that already recompute totals and bars.
- **Pencil in** = the planner's existing Add to plan write for today, plus a new grey row on Today. There is no new plan store.

---

## 1. What it is

An on-demand extension of Callie. It knows the mama's log for today and the last 28 days, her ranges, her food prefs, her plan, her kitchen, what she's told it before, and what time it is where she lives. It answers in Callie's voice using Callie's principles. It can act: meal cards she can log in one tap, plans she can pencil, and a handoff to Callie when it shouldn't be the one answering.

The purpose is to carry daily load off Callie so the program is evergreen. The metric that says it's working is in section 15.

## 2. Principles

1. **Value before decisions.** Opening the coach from Today shows the answer already rendered. Nothing is asked before something is given.
2. **The four ranges are equal, and the mama sees them as ranges.** What she's shown is what's logged and what's left to stay in range today, for calories, protein, carbs, and fat, in the same range form the app already uses (`76–86g left`, `in range`, `12g over`). No per-meal budgets, no "to range" phrasing, no macro singled out in copy except to name the one that's running tight. Callie's protein-first rule lives inside the ranker only (it breaks ties toward meals that make progress on protein without pushing carbs or fat over); it never appears as a sentence.
3. **Fit means 330's rule.** A card is shown as fitting only if `mealFitsRemaining(macros, budget)` passes against *this meal's* budget.
4. **Her clock.** Every date and slot is computed in her time zone.
5. **The model reads freely and writes nothing.** Logs, pencils, saves happen only when she taps. The one thing the model may trigger is a handoff.
6. **Numbers come from tools, never prose.** Budget, remaining, fit, patterns are computed by deterministic functions the model quotes.
7. **Bank before invention.** A saved or bank meal she can make beats a generated one.
8. **Coach, not Callie.** Labeled everywhere. Never renders under Callie's name.
9. **Floors, not just ceilings.** Never helps anyone eat under her ranges; hands off on restriction language.
10. **Cheap by design.** Small state block, cheap model for structured calls, one stronger model for conversation, hard caps.

## 3. Not in scope

Reading Callie's DMs. Group chat. Voice. Proactive or push messages from the coach. Editing ranges. A kitchen inventory with quantities. Restaurant search or delivery integrations. Streaming responses (v1). Changing the DM or channel stacks beyond the handoff row.

---

## 4. Surfaces

### 4.1 Coach tab (`src/components/CoachTab.jsx`)
Full-screen chat. Header: avatar, `Coach`, subline `Built on Callie's guide · knows your log · not Callie`, right-side link `What you know` (memory view). Below it the **context strip**, rendered from `state`, three lines max:
1. `Thu Sep 3 · 12:41 Denver · Lunch next`
2. `Logged: breakfast 905 cal · P 64 · C 53 · F 47` (one segment per logged slot; `Nothing logged yet today` if none)
3. `Left today to stay in range: 845–995 cal · P 76–86g · C 127–137g · F 13–23g`
plus `Pencilled: dinner · Shrimp tacos` when any exist. Nothing else in the strip. Then the thread, contextual chips, and the composer (photo button + text field).

### 4.2 Today block (`MealLogCard`, inside Today's log card, after the logged rows)
Plum-tinted block: title `Meal coach`, one hint line = `Left today to stay in range: {left line}. {Tight one} is the tight one.` (section 6.4), chevron. Tapping opens the Coach tab and auto-runs the "what fits for {next slot}" turn so cards are already there. Hidden when ranges are missing or the selected log date is not today.

When lunch is logged and dinner is neither logged nor pencilled, the hint becomes `Know what dinner is yet? I'll size it to what's left.`

### 4.3 Grey pencilled rows on Today (new)
Plan meals for today (from `client_week_plans` via `plannedMeals`) that are not yet logged render under their slot heading as a muted row: name, `Pencilled in · tap when you've eaten it`, `Ate it`. Hidden when a `meal_logs` row for today matches the plan meal's name (serving suffix stripped, case-insensitive) in **any** slot, so a slot move after logging doesn't resurrect the ghost. `Ate it` logs it through `appendMealEntry` with the plan meal's macros, `slot`, and `via: "recipe"` (or `custom` if it came from My meals), `source: "coach"` if it was pencilled from the coach. The plan meal stays in the plan (grocery keeps it).

### 4.4 Messages
Unchanged, except: a handoff appears in the mama's Callie thread as a message from the coach sender (section 10), labeled `Your meal coach`, and in Callie's admin inbox as `Coach handoff · needs you`.

### 4.5 Meals
Unchanged. Pencils show on the planner board and in the grocery list because they're plan meals.

---

## 5. Time zone (prerequisite)

- Add `profiles.timezone text`. Client writes `Intl.DateTimeFormat().resolvedOptions().timeZone` on app open when it differs from the stored value. Default `America/Los_Angeles` when null.
- Server computes `today = localDateIso(now, timezone)` (same shape `meal_logs.date` already uses) and `current_slot` with the `mealSlots.js` cutoffs at her local time. Extract those two pure functions so the server can import them.
- The coach's daily cap resets at her local midnight, not rolling UTC.
- Test: a mama in `Asia/Tokyo` and one in `America/Los_Angeles` at the same instant get different `today` and slots.

---

## 6. Engine (deterministic, shared by Today block and coach tools)

Pure functions in `src/utils/coachEngine.js` (or split as you prefer), importable by `functions/_shared` (packaging is your call, section 17.1).

### 6.1 What's left (shown) and the slot allowance (internal)

**Shown to the mama** (strip, Today hint, coach sentences): the left-in-range line, one entry per macro, computed exactly as the app's range bars do:
```
left(k) = lo_k − logged_k .. hi_k − logged_k     → "76–86g"  (or "845–995 cal")
          logged_k in [lo, hi]                   → "in range"
          logged_k > hi_k                        → "{n}g over" / "{n} cal over"
```
Line format: `845–995 cal · P 76–86g · C 127–137g · F 13–23g`. "Tight one" = the macro whose remaining-to-high is the smallest share of its range and under 35%.

**Used internally only** (never surfaced as numbers) so suggestions are sized for the slot and leave room for the meals still to come:
```
laterSlots = unlogged main slots after the selected one (snack is never "later")
reserve    = Σ laterSlots: pencilled plan meal macros if one exists for that slot today,
             else share[slot] × day range (high for cal/c/f, low for p)
allowance  = max(0, (hi − logged) − reserve) per macro; protein uses lo − logged
```
`share[slot]`: median share of the day per slot over the last 28 days from `mealHistoryByDate` (non-null slot, day total > 0), normalized; fewer than 5 qualifying days → defaults `.24 / .30 / .38 / .08`. Derived on load, not stored. When the mama asks for a plan, the model may describe the split in words (`lunch stays light, dinner carries more`) but the numbers it quotes are the day's left line and each card's macros.

### 6.2 Fit
A card **fits** if `mealFitsRemaining(scaledMacros, allowance)` passes for the selected slot (so the day still has room for later meals) **and** `mealFitsRemaining(scaledMacros, remainingToHigh)` passes for the day. If the ranges are missing, hide the Today block and the coach says so (`I can't see your ranges yet. Callie sets those.`).

### 6.3 Rank (Pick for me)
Candidates: Callie's bank (`RECIPES` + `withRecipeDetail`), `custom_meals`, `pantry.js`. Filters in order: diet (`pescatarian` / `vegetarian` / `vegan`, hard filter using the same categories `buildDietSafetyBlock` excludes, or a small keyword list if no client equivalent exists), dislikes (`allergens[]`, `foodAvoids` tokens; drop on name or bank-ingredient match), fit.

Scaling: try `[1, 1.5, 2, 0.75, 0.5]`. Keep 1.5 or 2 only if it closes ≥15g more `pNeed` than 1× and still fits; use 0.75 / 0.5 only if 1× doesn't fit.

Score among fitting:
```
3.0 × min(1, m.p / allowance.pNeed)   (1.0 if pNeed = 0)   // Callie's tie-break; internal only
+0.4 matches a like token from this slot's pref text
+0.3 source is My meals
+0.3 usual for this slot (≥3 name matches in 28 days in this slot)
+0.2 scale = 1
−0.5 logged today  · −0.2 logged in last 2 days
```
Diversity: no two of the three share a primary protein (keyword). Never the same meal at two scales. Thin results: show what fits plus a soft card (`Tell me what's in the fridge and I'll build a third.` / `Browse everything` → Meals with the 330 chip on). Never pad with a non-fitting meal.

### 6.4 Coach line (rule-based, used for the Today hint and the first sentence in the coach)
`Left today to stay in range: {left line}.` plus, when one exists, ` {Tight one} is the tight one.` Nothing else. No per-meal numbers, no macro named unless it's the tight one.
Over state (any macro or calories over range): the app's existing copy `Over on something today? Happens. Tomorrow start fresh.` Cards still render (lightest, easiest on the over macro).
First coach reply on "what fits": `You've got {left line} left today. These are {slot}-sized so {later slot} still fits{, and they go easy on {tight one} since that's the tight one}. Any of them logs in one tap.`

### 6.5 Plan day
This is where the split happens, and only here does the mama see the rest of the day divided. For each unlogged main slot in order: run rank against that slot's allowance, take card one, subtract it from remaining, continue. Return rows plus the day total for all four. Snack row optional, only when the day still has room. Never returns a day under the low end of calories or protein. The coach introduces it as `Here's how I'd split what's left ({left line}) across the rest of today` and may describe the shape in words (`lunch stays light, dinner carries more of the protein and carbs`).

### 6.6 Log patterns
Aggregates over 28 days, per question: over-range days per macro, which slot drove the overage on those days, top offending meals by name, per-slot averages, usuals. Returns computed facts only, no raw rows to the model.

### 6.7 Knows-you and reason lines
Knows-you (first that applies): pencilled → `Pencilled in earlier`; ≥3 logs this slot → `One of your usuals at {slot}`; ≥3 anywhere → `One of your usuals`; like match → `You like {word}`; pantry → `Quick one from your staples`; else `Close to what you usually eat`. Eating out: `You've had this here before`, `No cilantro, we'll ask`. **No counts, dates, or the word "logged" in any line.**
Reason (first that applies): fits every range with room → `Fits, and leaves room for {later slot}.`; fits but uses most of the tight macro → `Fits. Uses most of your {tight one}.`; scaled → prefix `{scale}×.`; over state → `Light, and easy on {the over macro}.`

---

## 7. `/api/coach`

Request `{ message, attachments?: [{path, mime}], client_message_id, auto?: "fits"|"plan" }`. Auth: mama JWT. Response `{ state, messages: CoachMessage[] }` where `state` is the state block (the client renders the strip from it).

### 7.1 Flow
1. Cap check (`estimate_calls.type='coach'`, 40 per local day; photo turns count 2; admins uncapped).
2. Insert the mama turn into `coach_messages`.
3. Build the state block (7.2) from the DB.
4. Load the last ~20 turns (≤6k tokens) + `coach_memory`.
5. `auto === "fits"` or `"plan"` (from the Today block or a chip): skip the model for hop one and run `suggest_meals` / `plan_day` directly, then one model call to write the one- or two-sentence lead-in around the tool result. This makes the common path one cheap call.
6. Otherwise: tool loop, max 3 hops (2 if runtime limits require; see 17.2). Model gets system prompt, state block, memory, history, tools.
7. Validate every card payload with `mealFitsRemaining` against the budget in the state block; mark `fit`, `close`, or `over` with `over_by`. Never render an AI macro claim as fitting without the check.
8. Insert the coach turn with `payload`, `tool_trace`, model and token fields. Return.
9. Async: summarizer after 30 min idle or every 10 turns (section 9).

### 7.2 State block (~2–3k tokens)
```
now_local, timezone, today, current_slot, next_unlogged_slot
ranges { cal, p, c, f as [lo, hi] }
logged_today: [{ slot, name, cal, p, c, f, via }] grouped by slot (empty if none)
totals_today { cal, p, c, f }
left_in_range: the left line per macro as strings (what the strip shows) plus numeric lo/hi remaining
tight_one: "fat" | "carbs" | "calories" | null
allowance_next_slot (internal sizing only; the model must not quote these numbers): { slot, cal, pNeed, c, f, reserve_source }
pencilled_today: [{ slot, name, cal, p, c, f }]
meal_shares { breakfast, lunch, dinner, snack, source }
prefs { diet, allergens[], food_avoids, pref_b/l/d/s raw, season_note }
coach_note (Callie's current note to her, if any)
kitchen { fresh: [{name, addedAt}], staples: [] }
habits_this_week (checkins adherence counts)
latest_summary (client_summaries blurb for today or newest; contains no DM content)
saved_meals_top (≤20 My meals by 28-day log count, with usual slot)
recent_usuals (names logged 3+ times in 28 days, by slot)
```

### 7.3 System prompt (`functions/_shared/coachPrompt.js`)
- Identity: Meal coach, built on Callie's guide, not Callie. Never claim to be her.
- `CALLIE_PRINCIPLES` + `CALLIE_VOICE` (section 12).
- Numbers rule: quote `left_in_range` or a tool result. Never compute macros or fit yourself. Never quote `allowance_next_slot`; it exists to size suggestions, not to be read out. When you describe what's left, give calories, protein, carbs, and fat as the ranges in the state block, and treat them as equals.
- Action rule: you propose, she taps. Never say you logged, pencilled, or saved anything.
- Floors and triage (section 10). On triage, call `handoff` and stop advising.
- Format: one or two sentences before any card block. No lists unless she asked for a plan.
- Memory: use `coach_memory.facts`; don't parrot them.

### 7.4 Tools
| Tool | Backed by |
|---|---|
| `suggest_meals({ slot?, constraints? })` | 6.3 rank |
| `plan_day({ slots? })` | 6.5 |
| `recipe({ ref })` | `withRecipeDetail` / `custom_meals` / generated payload |
| `log_pattern({ question })` | 6.6 |
| `build_from_kitchen({ ingredients, slot })` | `/api/meal-idea` `options` extended (section 8.1) |
| `eating_out({ restaurant?, cuisine?, photo?, slot })` | `/api/meal-idea` `eating_out` extended (8.2) |
| `read_fridge_photo({ path })` | `/api/meal-idea` new `fridge` mode (8.3) |
| `handoff({ reason, summary })` | section 10 |

Not tools: log, pencil, save. Those are client buttons.

### 7.5 Models
`COACH_MODEL` for conversation: current Gemini Flash tier (3.7/3.8 at intro pricing) as the starting point; needs tools + JSON schema + vision. `MEAL_PLAN_MODEL` (existing Flash-Lite) for structured calls. Both config strings. Bake-off before launch (section 16). `callOpenRouter` gets a tool-calling variant; the JSON-object path stays for existing modes.

---

## 8. Payloads and client actions

`coach_messages.payload` types and what the client does with them.

**`cards`** `{ slot, allowance_snapshot (internal, for the detail sheet's fit check), left_in_range_snapshot, cards: [{ ref: { kind: "bank"|"custom"|"pantry"|"generated", name }, name, scale, source_tag, knows_you, why, macros, fit, over_by?, recipe?: { ingredients[], steps[] } }] }`
- Tap card body → detail sheet (recipe, `ServingStepper` with 0.5 / 0.75 / 1 / 1.5 / 2, live fit check against `allowance_snapshot` and the day's remaining, Log it, Pencil in, Save to My meals).
- **Log it** → `appendMealEntry` with **flattened** macros at the chosen scale, name with `· 1.5×` suffix when scale ≠ 1, `slot` set, `via: "recipe"` for bank and plan meals, `"custom"` for My meals, `"describe"` for generated, `"menu"` for eating out; and `source: "coach"` to mark origin. Then `POST /api/coach/action { message_id, action: "logged", card_index, scale }` so the transcript and next state block know. Row subtitle: existing `VIA_LABEL` plus ` · via coach` when `source === "coach"`.
- **Pencil in** → plan write through `App.jsx` (`onWeekPlanChange`, `planDayLabel(today)`, `recipeToPlanMeal` / `customMealToPlanMeal` / `aiIdeaToPlanMeal`, `addMealToDay`) with `slot` and `via: "decide"`. One coach pencil per main slot per day (replace an existing `via: "decide"` plan meal for that slot; leave others).
- **Save to My meals** → the same `saveCustomMeal({ name, cal, p, c, f, serves, ingredients, slot, steps })`. `ingredients` as newline text (what `custom_meals.ingredients` is today). `steps` requires the new column (section 13). For generated meals this save is mandatory to offer; it's the flywheel.

**`plan`** `{ date, rows: [{ slot, card | reserved: { label, cal, p, c, f } }], day_total: { cal, p, c, f } }` with Pencil per row and Pencil all.

**`kitchen_confirm`** `{ items: [{ name, confidence }], photo_path }` → chips with ×, `Looks right` sends a mama turn `Confirmed: …` which triggers `build_from_kitchen`.

**`orders`** `{ restaurant, precision, source, items_read?, cards: [{ name, knows_you, get, skip, ask, macros, fit, over_by? }] }` → Get / Skip / Ask cards; Log it uses `via: "menu"`, `source: "coach"`, name `{order} ({restaurant})`.

**`handoff`**, **`steps`** (`walk me through it`), **`memory`** (facts list with × per item).

### 8.1 `options` mode extension (kitchen)
Optional request fields `budget`, `ingredients`, `rejected`, `refine`, `bankMatches`, `count`. When `budget` is present the prompt uses it instead of day bands and adds: all meals must fit the budget; protein sized to close `pNeed`; report all four macros. When `ingredients` is present: only listed items plus salt, pepper, water, common spices, cooking spray (`assumes[]` for anything else); max 5 ingredients, 3 steps, 20 minutes; card 1 must be `kind: "adjusted"` from a bank or pantry ingredient match or a My meals name match when one exists; `proteinShortfall` + `addOne` when nothing closes 70% of `pNeed`; never a stated dislike or diet violation. Existing planner callers send none of these fields and see no change.

Bank-first matching uses Callie's bank and pantry for ingredient overlap; My meals by name only (≈8.5% carry ingredients). Coach saves to My meals write ingredients and steps so this improves over time.

Kitchen list: `profiles.kitchen jsonb { fresh: [{ name, addedAt }], staples: [] }`. Fresh dashed at 5 days, dropped at 7. Staples seeded from `pantry.js` names and prefs. No quantities.

### 8.2 `eating_out` extension
Allow no photo when `description` names a restaurant or cuisine (remove the 400 for this caller only). `count: 3`. Per pick add `get`, `skip`, `ask`, `knowsYou`, `precision: "published"|"estimate"`. `remaining` = the slot budget. At least 2 of 3 must fit; the third may be what she likely wants with an `ask` that makes it fit. Dislikes become `ask` lines. Planner and Today Menu keep 5 picks and photo-required behavior.

### 8.3 `fridge` mode (new)
Same photo payload; returns `{ items: [{ name, confidence }] }`, ≤25, no macros, no prose. Counts against the coach cap.

### 8.4 Cap and error copy
429: `You've used today's coach questions. Your plan and My meals still work from Today, and Callie's a message away.` Failure: `I couldn't check your log just now. Try again in a minute.` Never a raw error.

---

## 9. Memory

`coach_memory { profile_id pk, facts jsonb [{ text, source_message_id, created_at, expires_at }], summary text, updated_at }`. Summarizer (Flash-Lite) after 30 min idle or every 10 turns: 300-word present-tense summary; durable facts she stated (`nursing`, `no cilantro`, `wedding Sat Sep 5` with `expires_at`); max 30 facts. Never DM content, never medical detail beyond what triage flagged, never anything she asked to forget. `What you know` renders facts with × per item; a `forget` intent removes matches.

---

## 10. Triage, floors, handoff

**Hand off and stop advising** on: medical symptoms (dizzy, faint, pain, bleeding, fever), pregnancy, breastfeeding intake or supply questions, medication, mood or mental health, weight anxiety, restriction language (`eat less`, `skip meals`, `fasting`, `punish`, `bad day so…`), asking to go under or change her ranges, and anything Callie marks as hers in `coach_note`. Keyword list in `coachTriage.js` plus the model's judgment; either firing is enough.

**Handoff mechanics.** Dedicated coach profile (`profiles.is_coach_bot = true`, admin role for RLS, hidden from rosters). Insert into `messages` for that `client_id` with new `kind = 'handoff'`, body = 3-line summary + `Last 3 days of logs are on her card.` `incomingSenderLabel` shows `Your meal coach` for that sender. `/api/message-notify` treats `kind='handoff'` like mama→Callie (push to `CALLIE_NOTIFY_EMAIL` admins, deep link to the admin thread). Admin inbox filter `Needs me` = unanswered handoffs; `I'll take this` marks it. The coach tells the mama what Callie will see and gives one holding line (`In the meantime, eat to your ranges and drink water.`), then stays off the topic for the session.

**Floors.** `plan_day` and `suggest_meals` never produce a day under the low end of calories or protein. If she asks for less, the coach says why not, once, in Callie's voice, and offers the in-range version.

---

## 11. Callie's side

- `functions/_shared/calliePrinciples.js` exporting `CALLIE_PRINCIPLES` (her rules in her words: protein first, whole foods, max 2 whole eggs, honey/maple/applesauce, stay in ranges, no invented macros, tomorrow's a clean slate) and `CALLIE_VOICE`. Seeded from the strings in `clientMealIdeaPrompt.js` and `mealPlanPrompt.js`; those files import from it. Test asserts the house rules still appear in every prompt. Admin editor is a later slice.
- Admin client card gets a read-only `Coach` tab listing `coach_messages` with 👍/👎 per coach message (`coach_feedback`). Weekly sample (10 conversations + all handoffs + all 👎) to an admin page or Sunday email.
- Recommend (Callie decides): the coach may quote `coach_note` back to the mama verbatim, attributed to Callie.

---

## 12. Copy and voice

`CALLIE_VOICE`: a friend who happens to be a coach; plain words, contractions; protein is the win, fat and carbs are ceilings not enemies; never guilt, cheat, bad, exclamation points, emojis, "just", "simply", "the AI"; over is `That's fine` plus a lighter option; concrete amounts; one sentence per line; **always all four numbers** when describing room; knows-you lines sound like a friend who remembers, never a database (no counts, no dates).

Fixed strings Callie signs off: Today block title and the `Left today to stay in range` line; `is the tight one`; strip labels; card knows-you and reason templates; pencil copy (`Pencilled in · tap when you've eaten it`, `Ate it`, `Know what dinner is yet?`); kitchen prompts (`Still have these from the weekend?`, `Looks right`); shortfall line; eating out empty state; handoff lines; cap copy; memory view copy.

---

## 13. Schema changes (all of them)

1. `profiles.timezone text` (section 5)
2. `profiles.kitchen jsonb` (8.1)
3. `profiles.is_coach_bot boolean default false` (10)
4. `coach_messages` (7), `coach_memory` (9), `coach_feedback` (11)
5. `messages.kind` gains `'handoff'` (10)
6. `custom_meals.steps text` (newline list) so coach saves carry steps (8)
7. `estimate_calls.type` gains `'coach'` (7.1)
8. `meal_logs.source = 'coach'` as a value (no column change; if `source` is already used for something incompatible, pick another marker and say so, section 17.4)
9. Bucket `coach-attachments/{profile_id}/…`, private

No new plan store. No servings column. No changes to `meal_logs` shape beyond values.

---

## 14. Slices and acceptance

### Coach 1: tab, Today block, engine, cards, plan, pencil, memory view (no photos, no handoff)
- Section 5 time zone. Section 6 engine with tests for every template branch, over state, last meal, pencilled reserve, default shares, snack-selected reserve, scaling acceptance, diversity, thin results, plan floors.
- `coach_messages`, RLS, `/api/coach` with state block, history, `suggest_meals`, `plan_day`, `recipe`, `log_pattern`, `auto` fast path, cap. `callOpenRouter` tool variant.
- `CoachTab.jsx`: header, strip from `state`, thread, chips, composer (text only), payload renderers `cards`, `plan`, `steps`, detail sheet with `ServingStepper`, Log it / Pencil in / Save to My meals wired to existing writes (8), `POST /api/coach/action`.
- `MealLogCard`: Meal coach block under log items with hint; grey pencilled rows with Ate it; ` · via coach` subtitle.
- `App.jsx`: plan write for pencils; tab bar with Coach.
- `calliePrinciples.js` consolidation + test.
- `custom_meals.steps` migration; `saveCustomMeal` passes `steps`.
- Events (15).
- Dev seed `/dev/coach`: `America/Denver`, 12:41 local, breakfast logged 905 / P64 / C53 / F47 (French toast, steak and eggs), 28 days of history with 11 fat-over days mostly at breakfast, one plan meal for dinner via `decide`.

**Acceptance (that seed):** Today shows the Meal coach block reading `Left today to stay in range: 845–995 cal · P 76–86g · C 127–137g · F 13–23g. Fat is the tight one.` Tapping it opens Coach with three lunch-sized cards already rendered (each fits the day and leaves room for dinner), the grey tool line, and a strip with exactly: date/time/next slot, logged breakfast with all four macros, and the left-in-range line. No per-meal budget numbers anywhere on screen. Tapping a card body opens the detail; 1.5× shows updated macros and a fit badge against lunch. Log it writes a `meal_logs` row with flattened macros, `slot: lunch`, `via: recipe`, `source: coach`; Today's totals and bars update without a refetch; the strip's left line updates; the Today hint changes to `Know what dinner is yet?`. Plan my day returns rows that split what's left across the remaining slots with a day total in every range; Pencil all writes plan meals for today; the grey rows appear on Today; Ate it logs one and hides it. `Why am I always over on fat?` answers from `log_pattern` with no number absent from the tool result and names the driving slot. `What you know` renders the memory list.

### Coach 2: handoff, triage, summarizer
- Coach bot profile, `kind='handoff'`, `incomingSenderLabel`, notify, admin `Needs me`, `Ask Callie instead` chip, `coachTriage.js`, floors enforced, `coach_memory` summarizer + forget.
- **Acceptance:** `I'm nursing and I've been feeling dizzy` produces one handoff row in her Callie thread labeled from the coach, one push to Callie, the admin filter shows it, and the coach gives no further advice on that topic in the session.

### Coach 3: photos and Callie's tools
- `PhotoPicker` extracted (from `MealLogCard` and `EatingOutMenuFlow`); `kitchen_confirm` via `fridge` mode; `orders` via extended `eating_out`; `options` extension for `build_from_kitchen`; `profiles.kitchen`; `coach-attachments`.
- Admin `Coach` tab, `coach_feedback`, weekly sample.
- Bake-off results applied (16).
- **Acceptance:** a fridge photo returns dashed chips, `Looks right` yields three cards of which card one is `adjusted` from a bank or My meals match when one exists; `Chipotle for lunch` returns three orders with 2+ fitting and Get / Skip / Ask.

### Later, only if data asks
Plan my day chip on Today (if morning opens with pencils are common). Streaming. Admin editor for `calliePrinciples`. Structured likes/dislikes chips in Food prefs.

---

## 15. Events and metrics

`coach_open { entry: today_block|tab, auto }`, `coach_turn { tools[], hops, ms, model, tokens_in, tokens_out }`, `coach_action { logged|pencilled|pencil_all|saved|looks_right|ask_callie|forget, via, scale }`, `coach_handoff { reason }`, `coach_cap_hit`, `coach_memory_view`, `today_block_shown`, `today_pencil_ate_it`.

After 14 days: **mama→Callie DM volume per active mama per week, before vs after** (the load metric); handoff count and Callie's response time; log rate per coach open (under 40% = cards are wrong); pencil rate and Ate it rate; Save to My meals rate on generated meals (the flywheel); share of meals logged with `source: coach` by slot; AI cost per active mama per week.

## 16. Bake-off (half a day, before Coach 1 ships to a mama)

Corpus: the mockup's conversations plus 25 real questions from Callie's DMs, anonymized, each with the state block that would have applied. Candidates: Gemini 3.7/3.8 Flash, GPT-5.6 mini tier, Claude Haiku 4.5, DeepSeek V4 Flash. Score 1–5: called the right tool and quoted its numbers; Callie's voice; never invented a number or claimed an action; quoted the left-in-range line with all four macros as equals and never a per-meal budget; triage fired correctly; cost. Ship the cheapest within one point of the best on quality. Record in `docs/COACH-BAKEOFF.md`.

Cost sanity: ~7.5k tokens in, ~300 out per turn ≈ $0.007 on Flash intro pricing; a heavy mama at 20 turns a day is under $5/month. Cache the system prompt prefix where supported.

## 17. You decide, then state it in the PR

1. How to share the engine's pure functions between `src/utils` and `functions/_shared` (shared folder, build step, or duplication with an equality test like `RECIPES`/`CALLIE_RECIPES`).
2. Runtime limits for the tool loop; if 3 hops won't fit, cap at 2 and rely on the `auto` fast path for the common question.
3. Whether `callOpenRouter` can pass `tools`/`tool_choice` through as-is on the Flash tier.
4. What `meal_logs.source` holds today and whether `'coach'` is a safe value there.
5. Whether `steps` on `custom_meals` should be text or jsonb (text is fine; match `ingredients`).

## 18. Still with Callie (not blockers)

`CALLIE_PRINCIPLES` in her words (seeded for her); fixed strings in section 12; default shares `.24 / .30 / .38 / .08`; whether the coach may quote `coach_note`; the triage keyword list; the holding line; weekly review cadence.

---

Start Coach 1.
