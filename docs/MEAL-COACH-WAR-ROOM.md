# Meal Coach — war room brief

**For:** CoS / $1M. **Branch:** `cursor/meal-coach-957a` (PR 343). **SHA:** `10af9a7`. **Sticky:** https://cursor-meal-coach-957a.macros-and-mamas.pages.dev

**Decision: do not merge tonight.** This is not the $1M focal. Slice B and Slice C stay frozen until the four gates below pass a lived test on that sticky preview.

North star, unchanged: Callie in her pocket for the next meal. Her ranges, her log, her stage. Two taps. No guilt. It has to feel like Callie helping the plate in front of her. If it feels like a macro calculator with cards, it does not ship.

---

## Score

| | Verdict |
| --- | --- |
| Intentional | The engine is. Local cards, fat as the ceiling, protein as a floor, her locked sentences, refusals that reach her, log/pencil on the real write path. |
| Flat | The screen she actually reads. A leftover-math essay, a "Hey.", three generic reasons, a snack question the UI cannot answer. |
| Sidekick gap | It does not reliably know which meal she is eating, it does not hand Callie the escalation, and the model turn drops fields the app already has. |

Inbox check, already measured in `docs/CALLIE-MESSAGE-FAQ.md`: "what should I eat?" shows up about four times in two months. They text protein, the day, the scale, hunger, fat, a specific plate. The coach's job is still the next meal inside the app. Growing it into the scale, supply, or a personality is how this becomes slop. Borrow her short food sentence. Leave the relationship in Messages.

---

## Ship / hold

**Hold the merge.** A mama who logged lunch and opens Coach can be offered breakfast. A "tonight" answer that goes to the model can still be stamped `slot: "breakfast"` on the card she logs. That fails the only job.

**Ship later, only after the four gates pass on the sticky URL** with `pgchammas+qa-active@gmail.com` (comp — do not email). Hard refresh. Code review is not the test.

---

## What is already doing the job

Keep these. They are the product.

- **"What should I eat?" stays on the phone.** `buildCoachAnswer` ranks Callie's bank, My meals, and pantry against the slot budget. No spinner, no model spend. Paid app shell already wraps the tab; `/api/coach` returns 403 when `paid` is false and the role is not admin.
- **Fat is the wall. Protein is the floor.** `budgetAsRemaining` leaves protein and carbs unbounded and keeps calories and fat as ceilings. 10–20g over the day's protein high is a note on the card, not a hidden meal.
- **Her sentences are hers.** `coachTeach` runs on the client and again on the server, so a crafted request cannot spend one of the 30 calls on a question she already answered. Italian, Chinese, sushi, pizza-as-the-meal, In-N-Out, coffee, alcohol, never-skip, real-food.
- **Refusals are instant and boring on purpose.** Supply, the scale, ranges, billing, symptoms, supplements. **Message Callie** opens her composer with `Hi Callie —` plus her question. Nothing sends itself. That part is right, and it is not sufficient (gate 4).
- **A card logs like any other meal.** `origin: "coach"`, `via` still means how the macros were made, save contract requires an explicit `true`. Pencil writes `via: "coach"` on the week plan. Clear works on the week she is viewing.
- **The model is not allowed to invent a menu.** A pasted link is fetched first. A dish name that is not on the page is dropped. A failed fetch asks for a photo and does not burn a call. Photo and menu cards stay labeled as estimates. `macrosPlausible` drops 4/4/9 nonsense before she sees it.
- **No fake history.** The "knows you" chip appears only for a real pencil, a 3× usual, a stated like, or an off-slot filing. Empty is allowed.
- **Today goes quiet when the day is logged or pencilled.** Right instinct.

---

## What reads as flat

Cut or sharpen these. Do not add a layer on top.

1. **The open is an accounting paragraph.** Header: `{Slot} · N cal to play with`, then "Aim for Xg protein. Up to Yg carbs and Zg fat.", then "Holding … cal for lunch · … for dinner". Then the bubble: protein sentence + fat/carb sentence. Then each card repeats "Hits protein and keeps fat in range." She can do the arithmetic. She came for the plate.
2. **"Hey."** Pet names stay out, correctly. A bare hey is not Callie either. Start on the food.
3. **The snack question is theater.** Under five slotted days, `snackHabitFromHistory` sets `ask: true` and the panel prints the one-snack-or-two line. Nothing in the UI sets `snackCount`. She is asked a question the screen will not honor. The designed default is one snack held back, not a choice.
4. **"Photo of my fridge" is a primary chip.** Fridge vision is on the cut list. A menu photo earns its place. A fridge model call does not, until the next-meal door is right.
5. **Generic card reasons.** `reasonFits` ("Fits what's left. Fat stays in range.") is the tell. One reason, tied to this plate, or silence.
6. **Trigger collisions already written up for her.** "Should I eat more" on a long workout day fires the end-of-day line. "Is that fine?" after no sleep fires the pizza-and-Oreo line. Do not add sentences tonight. Narrow a trigger only if a lived pass hits it. Her Keep/Rewrite on `docs/CALLIE-FAQ-ANSWERS.md` still owns the words.

---

## Four gates — freeze B and C until these pass

Lived on the sticky preview. One sitting. QA account. If any gate fails, stop.

### 1. Slot sequencing — real bug

`nextCoachSlot` calls `defaultCoachSlot` with `ignoreTime: true` (`src/utils/coachBudget.js`). That walks breakfast → lunch → dinner → snack and returns the first slot she has not logged or pencilled. The clock-aware function already exists and is not used.

Afternoon, lunch logged, breakfast not logged: the next door is **breakfast**. Today’s card title uses that same function, so she can see "Looking for a breakfast idea?" after lunch. The hint can disagree with the title: `coachEntryHint` special-cases "lunch logged, dinner open" and talks about dinner, while the title and the cards stay on breakfast.

A short local ask that names the meal does stamp the right slot (`localCoachIntent("what should I eat for dinner?")` → `answerWithCards({ slot: "dinner" })`). The miss is the default door, and the model path:

- The panel sends `slot: answer.slot` (the ignore-time slot).
- The server may correct the *prompt* via `slotNamedInAsk`.
- `buildSuggestedCards` then rebuilds every card with `answer.slot`, overwriting the meal slot.

So "is Chipotle ok tonight" (falls through to the model, test already expects that) can come back as cards with `slot: "breakfast"`. Log it, and dinner lands on breakfast. That is the bug the card-slot stamp was written to prevent, fed by the wrong slot.

**Pass:** At 3pm with lunch logged and breakfast empty, Today and Coach both say lunch is done and the next plate is dinner (or a snack only if she asked for one). "Tonight" / "dinner" on a model answer logs under dinner. Breakfast is offered when it is morning, or when she asks for breakfast.

**User test (Maya):** Log lunch on the QA account. Open Today, then Coach. Read the title and the first card’s slot before tapping Log it. Then type a tonight question that is specific enough to hit the model (a named restaurant). Log the card. Confirm the Today row says Dinner.

### 2. Feed the fields we already have — every model turn

No new schema. The local ranker already sees diet, allergens, avoids, the slot’s pref text, today’s log, pencils, custom meals, and 28 days of names. The model turn does not see the same mama.

`loadSelf` in `functions/_shared/clientAiAccess.js` keeps diet, prefs, season note, allergens, avoids, breastfeeding. It drops:

- `profiles.months_pp` — already loaded by the meal planner and meal-suggest.
- `macros.notes` — Callie’s own revision notes. The planner treats them as mandatory. Coach throws them away.

The client payload adds names (eaten, planned, usual, turned down) and a slot budget. It does not send the approved ranges. The budget is client-supplied; the server checks that the numbers are non-negative. It does not recompute them from `meal_logs`.

**Pass:** One `/api/coach` ask, inspected from the prompt inputs, contains her approved cal/P/C/F, today’s eaten names, slot prefs, breastfeeding flag, `months_pp`, `macros.notes`, and her real custom meals. Stage is an input so a 2-month plate and a 14-month plate can differ. It is not a sentence about her stage.

**User test (Jordan):** Use a profile that has a season note or a macro note Callie would actually care about (nursing, a food she will not eat). Ask for a plate in words the router will not answer locally. The food has to respect that note. If the note is absent from the request, fail.

### 3. One breath

Next meal, why this one, one swap. That is the whole open.

**Pass:** First screen, before she types, is one plate (name she recognizes), one clause (fat, or protein still open, or "you’ve had this at dinner"), and one alternative (the half, or the next card). The holding-line essay, the second macro sentence, and "Hey." are gone. "How’s my day looking?" can stay a separate tap. It is not the open.

**User test (Maya):** Cover the screen after three seconds. She can say what to eat and why. If she starts reciting grams held for later meals, fail.

### 4. Escalation lands on Callie’s card

Draft-to-1:1 is the right mama gesture and the wrong ops loop. She can drop the composer. Callie never sees it. `client_summaries` is the card she already opens (`AdminClientSummary`). RLS is admin-only, so the write is server-side with the service role. The table is one row per mama per day. A coach event must not wipe a summary she already generated.

**Pass:** Ask something the coach must refuse (supply, the scale, "lower my macros"). Message Callie still appears, unsent. On her admin card for that date, a factual line exists: what was asked, which door refused it. No model prose. No new table. An existing summary is still there afterwards.

**User test (QA + Jordan):** Trigger supply. Do not tap Send. Open the admin card. The brief is visible. Generate or reload the normal summary and confirm it was not replaced by the refusal line.

---

## Designed — do not file these as bugs

- **Add to Today is immediate.** Log it from Coach or Meals and the row is on Today. That is the loop.
- **Snacks stay off until she has a habit or she asks.** One snack is reserved in the budget. There is no second-snack product. Cut the question that pretends there is.
- **"Usually breakfast"** when `affinity === "elsewhere"` is the honest chip. A dinner filed under breakfast should say so. It is not a slot bug. The slot bug is offering that meal as the next door.
- **Supply goes to Message Callie**, even with food in the sentence. A passing "I’m nursing" keeps the food and the preface. Leave that split alone until she marks the FAQ.
- **Cortisol / blunted-metabolism lines** are locked teaches in `coachVoice.js`, pending her Keep/Rewrite on `docs/CALLIE-COACH-REVIEW.md`. Do not soften them in code tonight.

---

## Accuracy risks (so nobody "fixes" the wrong one)

- **Slot, above.** Highest. It writes the wrong `meal_logs.slot`.
- **Fit slack.** Coach fit still uses `mealFitsRemaining`: 40 cal and 8g fat of slack. A plate can clear the filter slightly over the slot ceiling. Protein slack does not matter here because protein is unbounded on purpose.
- **Rounding.** The strip uses `Math.round` on the slot budget. The tight-calorie sentence uses `round25`. Those two can disagree by up to 12 cal. One number on screen.
- **Half portions** divide the full plate by two. Display rounding can make the half look like it doesn’t add back. Fine as a choice next to the full plate. Do not let a half be the only breakfast.
- **Empty bank** copy is honest (`noneFit`). Do not backfill with a model meal when the bank misses.
- **OpenRouter.** Missing key → 503, no invented plate. Bad JSON → 502 and a retry line. `scope: "callie"` from the model deflects. `replyIsClean` can drop the sentence and still show cards; a card with no sentence fails gate 3.
- **Quota row is inserted before the model returns** (`checkAiLimit`). A timeout spends one of the 30. Real, and not a merge blocker next to the slot bug.
- **Paid gate** is on the app shell and on `/api/coach`. Admins skip the cap. Local cards do not spend it. Keep that split.
- **`client_summaries` primary key** is `(profile_id, for_date)`. Gate 4 has to append, or it will erase the admin snapshot. The column comment says this row is never `coach_note`. Keep that: `coach_note` is the banner she reads. The summary is Callie’s.

---

## Underused signals — already in the database

Use them inside gate 2. Do not design a new memory product around them.

| Signal | Where | Today |
| --- | --- | --- |
| Approved ranges | `macros` cal / protein / carbs / fat | Local math uses them. Model sees a client budget, not the ranges. |
| `macros.notes` | `macros.notes` | Planner and admin card. Coach drops them. |
| `months_pp` | `profiles.months_pp` | Planner and meal-suggest. Coach drops it. |
| Breastfeeding | `profiles.breastfeeding` | Model block + a typed preface. Not a reason to shrink the plate. |
| Slot prefs | `pref_b/l/d/s` | Like-tokens locally, a prompt block on the model. |
| Season note | `profiles.season_note` | Model only. |
| Diet, allergens, avoids | profile | Hard gates. Keep. |
| Custom meals | `custom_meals` | +0.3 score, no quality filter. Junk rides in. |
| Last logs | `meal_logs`, 28 days on the client | Names, share, usual-chip at 3×. |
| Pencils | `client_week_plans` `via=coach` | Reserve + chip. |
| `coach_note` | profile banner | She can dismiss it. It is not an instruction to the coach. Leave it. A hidden guardrail is Slice B, and Slice B is frozen. |

---

## Carve-out (the only extra in Slice A)

**Filter junk My meals before they outrank the bank.** No new table. Drop untitled, zero-macro, and obvious test rows from the coach pool and from the model’s "proven favorites" block. A saved meal with a real name and real macros still wins. This is a filter, not a new library.

---

## Cut

Do not build, and do not leave the chrome up:

- Streaks
- Grocery from the coach
- Fridge vision (remove the quick-ask chip; leave menu photos)
- "Same as yesterday" as a story. History may rank a usual. It may not narrate one.
- Proactive nudges, badges, "you haven’t logged"
- Personality layers: pet names, memory of her feelings, a coach that asks how she slept
- The unanswered one-snack-or-two bubble
- Any new locked sentence until she marks the FAQ

---

## Phased plan

Each item: her job, why it is her coach and not a generic bot, what we cut to pay for it, the lived test. Prefer subtract.

### Slice A — polish, then re-test

Unfreeze nothing else until this passes.

| Item | Job to be done | Why it’s her coach | Cut to pay for it | Lived test |
| --- | --- | --- | --- | --- |
| Slot follows the clock and the words she used | "What do I eat now?" means this meal, not the first empty checkbox | Callie would not offer breakfast after lunch | The ignore-time walk as the default door | Maya, gate 1 |
| One breath on open | Decide, don’t study | She names a food, then one reason | Holding-line essay, second macro sentence, "Hey.", generic `reasonFits` when a real reason exists | Maya, gate 3, three seconds |
| Model sees the fields we store | The plate respects notes Callie already wrote | A sidekick that ignores her file is a second opinion | Stage essays, new columns, new chips | Jordan, gate 2 |
| Refusal writes `client_summaries` without clobbering | Callie hears the hard question even if the mama never hits Send | The handoff is hers, not a dead composer | A new inbox, a bot that sends, model-written briefs | QA, gate 4 |
| Junk My meals filtered | The first card is food she would eat | Her saves should help, not bury the bank | Building a better saver, tags, ratings | QA: a junk row does not lead |
| Snack question removed | She is not asked a question we won’t apply | — | The bubble | Open Coach on a short history. The question is absent. One snack is still reserved. |
| Fridge chip removed | Menu photo stays for eating out | — | Fridge vision | Chip is gone. Menu photo still attaches. |

### Slice B — personalization, frozen

Open only after Slice A passes on the sticky preview, in this order, one at a time:

1. **Usual at this slot, said once,** when the 3× chip is already true. Job: "give me my dinner." Cut: a "same as yesterday" story, a weekly recap.
2. **`macros.notes` change the plate,** not the paragraph. Job: Callie’s instruction shows up as food. Cut: quoting the note back at her.
3. **One standing line from Callie per mama** only if she asks for it. The plan-review `coach_guardrail` idea. Job: the app stops contradicting yesterday’s text. Cut: reading her DMs, any auto-send. Test: Callie writes one line, the next card obeys it, the mama never sees the line.

Anything else in "personalization" (mood, streaks, memory of guilt) fails the bar. Do not schedule it.

### Slice C — scale, frozen

Not a build list. The scale path is Slice A working for every paid mama without Callie typing the plate.

Watch only: `meal_logs.origin = 'coach'` that were actually eaten, deflect rate, coach calls vs opens, in-range days. DM volume is a weak score — she sends more than they do, and they rarely ask "what should I eat?" in Messages.

Do not sell a higher cap, a weekly read, or more cuisines until the four gates pass and those counts exist. More Gemini coverage of Chipotle is not scale.

---

## Lived bar

**Maya** — meal in front of her, two taps, no guilt. She can say the plate and the reason in one breath. The slot on Today matches the meal she is about to eat. She is not shown breakfast after lunch, and she is not lectured.

**Jordan** — the mama in the FAQ. Protein, hunger, a specific plate, sometimes nursing or the scale. Food questions get food. Supply and the scale go to Callie, and Callie can see that they did. The coach does not mention the scale, milk output, or a goal weight.

**QA** — `pgchammas+qa-active@gmail.com` on the sticky preview, hard refresh. Gates 1–4 in one sitting, plus the junk-meal filter and the two cuts (snack bubble, fridge chip). Founding-mama checks stay skipped; that account does not exist.

---

## Tonight

No merge. No Slice B. No Slice C. The next build, when it happens, is the four gates, the My meals filter, and the two cuts. Callie still marks Keep / Rewrite / Mine / Model on `docs/CALLIE-FAQ-ANSWERS.md` before any new sentence is locked.
