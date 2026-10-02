# Meal coach — plan review

**Reviewing:** `docs/MEAL-COACH-PLAN.md` (build plan) and `docs/meal-coach-mockup.html` (visual spec, open
at phone width). Both are committed alongside this review so it reads on its own.
**Written against:** `main` at `83bf2c6`, plus a read-only pass over the live Supabase project (4 Sep 2026).
**Rule the plan set for itself:** *"If the repo disagrees, the repo wins and you say so in the PR."* This is that.

Nothing here is a style note. Every item below either changes what gets built, changes what gets
measured, or is a bug that ships broken if we build the plan as written.

---

## Verdict

The shape is right and I would build it. The tab, the Today block, deterministic numbers with the model
on top, client-side writes, one-tap logging, handoff to Callie — that is the correct product, and the
mockup is the best artifact in this repo for showing what "good" looks like.

Four things need to change before a line of it gets written, and I would not start Coach 1 without
decisions on them:

1. **The ranker rejects exactly the meals it is supposed to prefer.** Protein is used as a ceiling. Under
   the plan as written, all three hero dinner cards in the mockup are filtered out as "doesn't fit."
   Proven below.
2. **The common path should not call a model at all.** Today block → cards should render instantly and
   locally. As specified, principle 1 ("the answer is already rendered") cannot be honored — it is a
   server round trip through an LLM.
3. **`meal_logs.source = 'coach'` is silently dropped by `db.addMealLog`.** Coach attribution never lands,
   and the section 15 metric that depends on it measures nothing.
4. **We are about to delete a tested engine and rebuild it worse.** PR 332 already contains ~1,250 lines
   of the section 6 engine and ~940 lines of tests, and it already fixes two of the sharp edges this plan
   walks into.

Plus a metric problem: the live numbers say the load the plan is aiming at is the smaller half of Callie's
day. Section "The metric is pointed at the wrong load" below.

---

## Evidence

Two things below were measured against the real, shipped code rather than reasoned about.

- **The fit tables and the range-copy table** come from importing `mealFitsRemaining` and `targetBands`
  and `formatRangeProgress` out of `src/utils/` and running the plan's own formulas over the mockup's own
  seed data (breakfast 905 / P 64 / C 53 / F 47, ranges from `targetBands({cal:1750, protein:140,
  carbs:180, fat:60})`, default shares `.24/.30/.38/.08`). Every input needed to re-derive them is stated
  where they appear.
- **The tab-bar numbers** come from rendering the `tabBar` markup and inline styles from
  `src/views/ClientApp.jsx` verbatim in headless Chrome at three phone widths, with Karla loaded, and
  measuring each button's laid-out width.

Live-database facts quoted below came from read-only aggregate queries. No production row was read for
its content, written, or mutated. No message body was read.

---

## 1. The fit rule rejects protein — the engine bug

Section 6.1 defines the slot allowance with **`allowance.p = lo − logged`** ("protein uses `lo − logged`").
Section 6.2 then says a card fits if `mealFitsRemaining(scaledMacros, allowance)` passes.

`mealFitsRemaining` is a *ceiling* test. It rejects a meal when `meal.p > allowance.p + 8`. So the plan
feeds a protein **floor** into a **ceiling** check. The more protein a meal has, the more likely it is to
be thrown away — by the same engine whose section 6.3 score is `3.0 × min(1, m.p / allowance.pNeed)`,
i.e. protein-first.

Run against the mockup's own seed (breakfast 905 / P 64 / C 53 / F 47, ranges 1750–1900 · 140–150 ·
180–190 · 60–70):

```
LUNCH allowance: {"cal":273,"pNeed":23,"pHigh":33,"c":65,"f":0}

card                                          P    plan(pNeed)  pHigh   protein-not-a-wall
Greek yogurt, berries, granola (mockup card 1)27   FITS         FITS    FITS
Turkey roll-ups and an apple (mockup card 2)  25   FITS         FITS    FITS
Cottage cheese and pineapple (mockup card 3)  24   FITS         FITS    FITS
Chicken breast + rice bowl, small             38   REJECT       FITS    FITS
Callie's bank: Tuna and rice, 1x              42   REJECT       REJECT  FITS
```

The three cards in the mockup survive only because each happens to be ~25g of protein. Every genuinely
protein-dense lunch is filtered out. Dinner is worse:

```
DINNER allowance: {"cal":705,"pNeed":49,"pHigh":59,"c":99,"f":17}

card                                          P    plan(pNeed)  pHigh   protein-not-a-wall
Chicken and rice bowl · 1.5 servings          78   REJECT       REJECT  FITS
Shrimp tacos, no sour cream                   62   REJECT       FITS    FITS
Salmon, rice, green beans                     62   REJECT       FITS    FITS
```

**All three of the mockup's dinner cards are rejected by the plan's own rule.** Correcting the ceiling to
`pHigh` (`lo + 10 − logged`) rescues two. The mockup's top pick — the 1.5× chicken bowl that "Plan my day"
pencils and that "Pencil all" writes to her week — is still rejected, because 78g of protein overshoots a
150g daily high when 91g is already logged.

This is not an arithmetic slip. It is a philosophical collision that has been sitting in the codebase
since PR 330 and the coach is the thing that detonates it: **`mealFitsRemaining` treats protein as a wall,
and Callie coaches protein as a floor.** For the Meals-tab filter that is a mild annoyance — a few
high-protein meals get hidden. For a coach whose entire ranking premise is "protein first," it is fatal.

**Recommendation.** For the coach, protein stops being a rejection axis. Fit is decided on calories,
carbs, and fat. Protein over the high becomes a note, in Callie's voice, not a filter:
`More protein than your range needs. That's the one to be over on.` This needs Callie's explicit yes — it
is section 18 material that is actually a blocker, not a nicety — and if her answer is "no, the protein
high is a real wall," then the plan's protein-first ranker has to go instead. One of the two must give.

Whatever we decide, `allowance` must carry **both** `pNeed` (for scoring, "how much protein is she still
short?") and `pHigh` (for any ceiling test). Section 7.2's state block currently carries only `pNeed`, so
the server literally cannot do the fit check correctly.

**Also:** section 6.2's second gate is dead code. `allowance = max(0, remaining − reserve)` and
`reserve ≥ 0`, so `allowance ≤ remaining` on every axis, and `mealFitsRemaining` is monotonic in the
budget. 200,000 randomized trials found no case where a meal passes the allowance check and fails the
day check. Drop it — a gate that never fires is a gate the next person will trust.

---

## 2. The common path should not touch a model

Principle 1 is *"Opening the coach from Today shows the answer already rendered. Nothing is asked before
something is given."* The plan then routes that moment through: client → `/api/coach` → cap check → DB
insert → build state block from six tables → load history and memory → run the tool → **one model call to
write a lead-in sentence** → insert → return. That is two to five seconds of "thinking…" before she sees
a card. Value is not before decisions; value is after a spinner.

It does not have to be. Everything that answer needs is already in the mama's browser:
`mealHistoryByDate` (28 days), `todayLog`, `macros`, `customMeals`, `RECIPES`, `PANTRY_ITEMS`,
`planMealsForLogDate`, and her prefs. And the lead-in sentence is not model output — section 6.4 already
specifies it as a **template**:

> `You've got {left line} left today. These are {slot}-sized so {later slot} still fits{, and they go easy
> on {tight one} since that's the tight one}. Any of them logs in one tap.`

So the "what fits" turn is fully deterministic. It should render **locally, instantly, offline, and for
zero cents** — cards on screen before the tab transition finishes.

**Recommendation: local-first coach.**

| Turn | Where it runs | Latency | Cost |
|---|---|---|---|
| Today block hint | client, on render | 0 | 0 |
| "What fits for {slot}" (the auto turn, and the chip) | client | ~0 | 0 |
| "Plan my day" | client | ~0 | 0 |
| Free-text question, kitchen, eating out, patterns | `/api/coach` | model | metered |

The server keeps the transcript and stays the authority: it re-derives the numbers from the DB for
anything it asserts, and it validates every card payload it returns. But a mama who taps the Today block
should never wait, never burn a quota unit, and never see "I couldn't check your log just now" for the
single most common thing she will ever ask.

This also dissolves section 17.1 (how to share pure functions between `src/utils` and
`functions/_shared`). The deterministic engine's home is `src/utils/`. The server needs a much smaller
subset — enough to validate a payload and build a state block — and duplicating *that*, with an equality
test in the `RECIPES` / `CALLIE_RECIPES` style, is tolerable. Duplicating 1,300 lines of ranking logic
with a string-compare test is not.

Second-order benefit: it makes the cap humane. Section 8.4's copy — *"You've used today's coach
questions"* — currently fires on the highest-value, lowest-cost interaction in the product. Under a
local-first split, cards never hit the cap. Only conversation does.

---

## 3. Do not throw away the Help-me-decide engine

The plan opens with *"Archive the Help me decide PR and its branch. Do not carry its UI or commits
forward. Branch fresh from `main`."* Scrapping `DecideSheet.jsx` is right — the bottom sheet is the wrong
surface and 1,397 lines of it should die. But across 25 commits, PR 332 is not just a sheet:

| File | Lines | Tests | What it is |
|---|---:|---:|---|
| `src/utils/decideBudget.js` | 660 | 508 | Section 6.1 and 6.5, plus the cases the plan doesn't cover |
| `src/utils/decideRank.js` | 295 | 231 | Section 6.3 — scale, score, diversify, thin results |
| `src/utils/decidePrefs.js` | 158 | 40 | Diet gates, dislike tokens, like matching, primary protein |
| `src/utils/decideScale.js` | 72 | 80 | Scale / unscale so a 1.5× card is never multiplied twice |
| `src/utils/decidePencil.js` | 69 | 78 | Plan-meal write, one pencil per slot, clear on log |
| `src/lib/decidePointerTrap.js` | 87 | 71 | Sheet focus and pointer handling |

That is essentially all of section 6, already written, already reviewed, already under test — and it
**already fixes two of the traps this plan walks into**:

- `budgetAsRemaining()` maps protein to `pHigh`, not `pNeed`, for the fit check. That is issue 1 above,
  solved.
- `computeSlotBudget()` handles the case the plan is silent on: what happens when the later-slot reserve
  is *larger than what's left in the day*. The plan's `allowance = max(0, (hi − logged) − reserve)`
  collapses to zero and returns nothing. PR 332 re-splits the leftover proportionally so cards still come
  back and breakfast is not wiped to 0. That case is not exotic — it is every mama who is behind at 4pm.

**Recommendation.** Keep the engine, drop the UI. Rename `decide*` → `coach*` in one mechanical commit,
port the tests with it, then build the coach on top. Reconcile it against the plan's section 6 rather
than reimplementing section 6 from scratch. The delta is small: the score weights, the knows-you and
reason templates, and the copy. The subtle parts — scale/unscale, share floors, reserve degradation,
pencil replacement — are the parts we would get wrong the second time, and they are done.

Two notes on the port:

- PR 332 marks its pencils `via: "decide"`. Rename to `via: "coach"`. `sanitizePlanMeal` spreads
  `...meal`, so a custom `via` survives the week-plan normalizer — verified.
- Four `meal_logs` rows in production already carry `via`/`source` = `decide_bank` from PR 332 testing.
  Harmless (there is no check constraint on `via`), but `VIA_LABEL` has no entry, so those rows render as
  "adjusted by you." Worth a cleanup line when we pick a final marker.

---

## 4. `source: 'coach'` never lands, and the metric that depends on it measures nothing

Section 13.8 says `meal_logs.source = 'coach'` is a value change, "no column change." Section 8 says
Log it calls `appendMealEntry` with `via: "recipe"` **and** `source: "coach"`. Section 15 then proposes to
measure "share of meals logged with `source: coach` by slot."

`src/db/db.js`:

```js
const via = entry.via || normalizeVia({ source: entry.source, via: entry.via });
// ...
.insert({ ...base, via, source: viaToLegacySource(via), slot })
```

`source` is **derived from `via` on every write**. `entry.source` is only ever consulted as a fallback for
inferring `via`, and it is never written. Pass `{ via: "recipe", source: "coach" }` and the row lands as
`via: "recipe"`, `source: "recipe"`. The coach marker is dropped in silence — no error, no warning, and
the acceptance test in section 14 ("`Log it` writes a `meal_logs` row with … `source: coach`") fails.

The live table confirms `source` is a pure mirror with no independent signal in it:

```
via: describe 3259 | custom 2073 | photo 985 | adjusted 855 | recipe 663 | manual 559 | menu 15
source: text 3259 | custom 2073 | photo 985 | adjusted 855 | recipe 663 | manual 558 | menu 15
```

It gets worse on edit. `updateMealLog` rewrites `source` from `via` whenever the patch carries `via`, and
`MealLogCard`'s edit form always sends `via`. So even if we forced `source` in, the first time she nudges
the servings on a coach-logged meal, the attribution is erased.

**Recommendation: a new nullable column, `meal_logs.origin text`.** It is a genuinely new axis — "who
suggested this?" is orthogonal to "how were the macros obtained?", which is what `via` means. It survives
edits, because nothing derives it. It keeps `VIA_LABEL` intact, so the row subtitle composes cleanly as
`from your plan · exact · via coach`. And it leaves room for `origin = 'planner'` or `'callie'` later
without another migration.

The alternative — a new `via` value like `coach_recipe` — is worse on every count: it needs `VIA_LABEL`
and `normalizeVia` entries, it collides with the `adjusted` rewrite on edit (so the marker dies the first
time she edits), and it makes `via` mean two things at once.

Follow `saveCustomMeal`'s graceful-degradation pattern when adding it, so a preview deploy against an
un-migrated database does not break every save.

---

## 5. The metric is pointed at the wrong load

The stated purpose is *"to carry daily load off Callie so the program is evergreen,"* and section 15's
headline metric is **mama→Callie DM volume per active mama per week, before vs after**.

Live, last 28 days:

| | |
|---|---:|
| Paid, non-refunded mamas | 74 |
| Mamas who logged in the last 7 days | 55 |
| Messages **from** mamas | 487 |
| Messages **from** Callie | 706 |
| Mamas who sent at least one DM | 66 |
| Most DMs from a single mama | 37 |

Mamas send about **1.7 DMs each per week**. Callie sends **1.45 messages for every one she receives.**
Her load is not an inbox she is drowning in; it is the proactive coaching she generates. Even a wildly
successful coach that deflects half of all inbound food questions saves her on the order of a handful of
replies a day, and the plan's headline number will move by an amount indistinguishable from a quiet week.
We will have built the best thing in the product and the dashboard will say it did nothing.

**Recommendation.** Keep DM volume as a secondary signal, and lead with the two numbers that reflect what
the coach is actually for:

- **In-range days per mama per week, before vs after.** This is the product's promise, it is computable
  from `meal_logs` + `targetBands` with no new instrumentation, and it is the number Callie would care
  about. If the coach works, mamas hit their ranges more often. If it doesn't, nothing else matters.
- **Logs per active mama per day, before vs after.** The coach's real leverage is that logging becomes
  one tap from a suggestion instead of a photo, an estimate, and a confirm. Mamas already make ~4 AI
  estimate calls a day each (1,572 `estimate_calls` in 7 days across 55 active mamas); if the coach
  converts a chunk of those into one-tap logs, that is a visible, honest win.

Keep `log rate per coach open` (the plan's "under 40% = cards are wrong") — that one is exactly right and
is the fastest quality signal we will have.

---

## 6. The coach will contradict Callie

Section 3 excludes reading Callie's DMs. That is the right call for privacy and I am not arguing with it.
But it has a consequence the plan does not address: **the coach has no idea what Callie told her
yesterday.** Callie DMs "let's pull carbs back this week and lean on protein" — 706 such messages in 28
days — and the coach, which cannot see it, cheerfully offers a rice bowl that fits her ranges perfectly.

The mama does not experience that as a privacy boundary. She experiences it as her coach and her app
disagreeing, and the thing she stops trusting is whichever one is cheaper to ignore.

`profiles.coach_note` is the only channel that crosses, and the plan does use it — but it is a *banner
for the mama*, dismissible, written for her to read, not for the coach to obey. It is not a control
surface.

**Recommendation.** Give Callie one field per mama that is explicitly the coach's standing instruction —
call it `profiles.coach_guardrail` — surfaced in the admin client card under a label that says exactly
what it does: *"Your meal coach follows this. She never sees it."* One line, her words, injected verbatim
into the system prompt above everything else. That is the difference between a coach that is an extension
of Callie and a coach that is a second opinion.

This is cheap to build and it is the single highest-leverage thing Callie can hold. It also gives her a
lever when the coach gets something wrong for one mama, instead of filing a bug and waiting for us.

---

## 7. Five tabs do not fit

The mockup's five-tab bar, rendered with the real styles from `src/views/ClientApp.jsx` (Karla 13.5px/700,
`padding: 14px 14px`, `gap: 4`, `justifyContent: center`, no wrap):

```
390px (iPhone 14/15) — shipped 4 tabs   needs 347px  — fits with 43px spare
390px (iPhone 14/15) — proposed 5 tabs  needs 421px  — overflows by 31px
375px (iPhone SE / 13 mini)             needs 421px  — overflows by 46px
360px (iPhone 12 mini)                  needs 421px  — overflows by 61px
```

`Shell` sets `overflow: hidden`, so this clips rather than scrolls: the active "Today" pill loses its
left edge and "Messages" loses its right edge.

Not a blocker, but it needs a decision before the tab is built, not after:

- Shorten labels (`Progress` → `Stats`, `Messages` → `Inbox`) — cheapest, and touches shipped copy Callie
  owns.
- Icon over label, 11px caption — the conventional five-tab pattern, and a bigger design change than this
  feature should be smuggling in.
- Drop `padding` to `14px 8px` and `gap` to 2 — buys ~54px, fits at 390 and 375, still clips at 360, and
  shrinks tap targets on the app's primary navigation.

I would ask Callie which two labels she is willing to shorten. That is the only option that does not
degrade something.

---

## 8. Copy: "in range" is not what the app says

Section 6.1 specifies three states — `76–86g left`, `in range`, `12g over` — and calls this "the same
range form the app already uses." Two of the three match. The middle one does not. `formatRangeProgress`
in `src/utils/rangeProgress.js`, which renders the `RangeBand` captions in the very same Today card the
coach block sits inside:

```
fat, under               -> 47g logged       | 13–23g left
fat, inside the band     -> 64g logged       | 6g room
fat, at the top          -> 70g logged       | at the top
fat, over                -> 82g logged       | 12g over
calories, under          -> 905 cal logged   | 845–995 cal left
```

The app says **`6g room`** and **`at the top`**. It has never said "in range" about a macro. If we ship
the plan's wording, the Today screen will show a fat bar reading "6g room" and, four inches below it, a
plum block reading "F in range." Two vocabularies, one screen, and the mama has to work out that they
mean the same thing.

**Recommendation.** Call `formatRangeProgress` and compose the left line from its output. Do not
reimplement the formatter. One function, one vocabulary, and the coach line and the range bars can never
drift.

---

## 9. "The tight one" is underspecified and the two readings disagree

Section 6.1: *"the macro whose remaining-to-high is the smallest share of **its range** and under 35%."*
The mockup computes `remaining / dayHigh`. Those are different denominators, and on the plan's own seed
they give different answers:

```
Reading A (mockup — remaining / day high):
  {"fat":"0.329","carbs":"0.721","calories":"0.524"}   -> tight one: fat
Reading B (plan text — remaining / band width):
  {"fat":"2.30","carbs":"13.70","calories":"6.63"}     -> tight one: null
```

Because macro bands are only 10g wide (`targetBands`: `hi = lo + 10`, calories `lo + 150`), "share of its
range" is nearly always far above 1 and the 35% threshold never trips. Reading B produces **no tight
macro at all**, and section 14's acceptance string — `Fat is the tight one.` — fails.

Pin it: **share of the day's high**, which is the mockup's behavior and the one that produces the right
answer. Worth writing into the test as the literal acceptance string.

---

## 10. Snack is the second-most-logged slot, so it cannot be "never later"

Section 6.1: *"`laterSlots` = unlogged main slots after the selected one (snack is never 'later')."*

Live slot distribution across all `meal_logs`:

```
breakfast 2356 | snack 2030 | dinner 1992 | lunch 1772 | (null) 263
```

Snacking is not an edge case in this population — it is the second most common slot, ahead of both dinner
and lunch, and 97% of rows carry a slot so the data is trustworthy. If we reserve nothing for it, every
dinner card is sized as though the evening snack will not happen, and the habitual snacker goes over
every single night while the coach tells her it fits.

PR 332 already handles this: `reserveSlotsAfter()` includes snack by default with a configurable
`snackCount`, and `effectiveSlotShare()` floors each slot's derived share at the default so a sparse
history cannot collapse a slot to zero. Another argument for the port.

The good news: `deriveMealShares` will work. It needs five qualifying days of slotted history in 28 and
that is comfortably met — only 263 of 8,413 rows have a null slot.

---

## 11. Time zone: the server must not decide what day it is

Section 5 adds `profiles.timezone` and has the server compute `today` and `current_slot`. Confirmed
absent from the live schema, so the column is genuinely new. But there is a trap.

`meal_logs.date` is written by the **client**, from `localDateIso()` — the browser's calendar day. If the
server independently computes `today` from a stored IANA zone, the two disagree whenever she travels,
whenever her device clock is off, and for anyone whose stored zone is stale. Near local midnight the
coach would talk about a different day than the Today screen is showing her — which is exactly the
`client_summaries` UTC-vs-local drift already documented in `MESSAGES-AND-COACH-QA.md`.

**Recommendation.**

- The **client sends** `local_date` and its IANA zone with every coach request. The server treats
  `local_date` as authoritative for reads and only sanity-checks it (reject if more than one day from its
  own computation, to stop a nonsense value poisoning the transcript).
- `profiles.timezone` still gets written and stored — it is needed for cron, emails, and anything that
  runs when her browser is closed. It just is not what the coach reads.
- `mealLogDate` (the day she has *selected* in the log, which is not always today) stays authoritative
  for writes, exactly as it is now.

Extracting `guessSlotFromTime`'s cutoffs into a pure function is fine and worth doing regardless.

---

## 12. The handoff has four unstated blockers

Section 10 is directionally correct and matches `MESSAGES-AND-COACH-QA.md`. Four things it does not say:

**`messages.kind` has a check constraint.** Live: `CHECK (kind = ANY (ARRAY['chat','announcement']))`.
Adding `'handoff'` is a constraint change, plus updates to the RLS insert policy in
`031_security_hardening.sql` which enumerates who may write which kind. Not hard, but it is DDL on the
messaging table — it wants a `supabase/tests/` RLS test, which CI runs.

**The bot needs a row in `auth.users`.** `profiles.id references auth.users(id)`. A coach-bot profile is
not a config flag; it is a real auth user that has to be created and whose credentials must never be
issuable. Worth stating out loud given the "never sign a user out" history: this identity must never
reach a browser.

**Do not give the bot `role = 'admin'`.** The plan says "admin role for RLS." `is_admin()` gates
`messages_select_thread`, so an admin bot can read **every mama's entire DM history with Callie** — the
exact data section 3 promises the coach never sees, and the exact promise the memory view prints on
screen (*"I never read your messages with Callie."*). Insert handoffs with the **service role** from the
server instead, and leave the bot profile as a non-admin marked by a flag. A bot that cannot read is a
bot that cannot leak.

**`message-notify` will drop the handoff on the floor.** It routes by "is the sender an admin." A
non-admin bot sender in a mama's thread where `sender_id !== client_id` matches none of `mama_to_callie`,
`admin_to_mama`, or `admin_to_admin`, and falls into the `ignored` branch. Callie gets no push. The plan
says "treats `kind='handoff'` like mama→Callie" — right instinct, and it is a real code change in
`functions/api/message-notify.js`, not a config line.

One more, on the mama's side: `incomingSenderLabel` is a **local function inside
`src/components/MessagesThread.jsx`**, not an export. Changing it is a component edit, and it is the
single point where the bot stops looking like Callie. Get it wrong and a handoff renders under Callie's
name — which breaks principle 8 and is worse than not shipping the handoff at all.

---

## 13. The cap, and the model call

**Log after success, not before.** `meal-idea` inserts its `estimate_calls` row *before* the OpenRouter
call, so every timeout burns a unit of her quota. `estimate` and `meal-suggest` log after success. The
coach must follow `estimate`, not `meal-idea` — otherwise a bad model afternoon silently eats her day and
she gets section 8.4's cap copy without having received a single answer.

**Rolling 24h, not local midnight.** `estimate_calls` is `(profile_id, type, created_at)` with no date
column, and every existing cap is rolling UTC. A local-midnight reset means either trusting a
client-supplied date for a rate limit — which is not a rate limit — or adding a column. Under the
local-first split from section 2 above, the cap only ever applies to conversation, and rolling 24h is
fine and consistent with everything else.

**Watch the total.** 40 coach + 20 meal-idea + 40 estimate = 100 model calls per mama per day. At 74
mamas that is a ceiling worth knowing before we set it, not after the invoice.

**`callOpenRouter` cannot pass tools today** (section 17.3). Confirmed — the body is
`{model, models, provider, max_tokens, temperature, messages, response_format?}`. Adding `tools` /
`tool_choice` is a small change; the hazard is `models:`, the OpenRouter fallback chain. Tool-calling
support and format vary by model, so a silent fallback to the next model in the chain mid-tool-loop
produces a malformed call and a broken turn.

**Recommendation.** For the tool loop, pin **one** model with no fallback chain, and on failure degrade
to the deterministic path — render the cards with the template lead-in — rather than falling back to
another model. That is better product behavior anyway: when the model is down, she still gets her
answer. Keep the existing chain for the JSON-object modes, which are unaffected.

---

## 14. Grey pencilled rows: right idea, wrong first slice

Section 4.3 adds a third row type to Today: plan meals rendered muted under their slot with an "Ate it"
button.

Two problems. First, plan meals for today **already render on the Today screen**, in the My plan picker
(`LoggableMealRow`), unfiltered by what has been logged. Grey rows would show the same meal twice on one
screen with two different affordances, and the plan does not say which one wins.

Second, the audience is small. Of the mamas who logged in the last 7 days, only **17 have any planned
meal in the last 28 days** — about 31%. Those who plan, plan hard (30 meals per plan on average), but
"Pencil in" is a power-user action and "Log it" is the universal one.

**Recommendation.** Coach 1 ships **Log it** as the primary action and **Pencil in** as secondary, and
skips grey rows entirely. Get the log loop excellent for 100% of mamas first. Revisit grey rows once we
can see the pencil rate — which is the plan's own instinct in "Later, only if data asks," just applied
one slice earlier.

If grey rows do ship, the plan's own fix (match on name in **any** slot, not name+slot) is correct and is
the fix `MEAL-LOG-EDIT-QA.md` asks for. Keep it.

---

## 15. What is missing

Five gaps, roughly in order of how much they cost us.

**She will eat something else, and nothing learns from it.** The most common real outcome of "here are
three meals" is that she eats a fourth thing. `coach_action` records `logged` and `pencilled`; nothing
records *nothing*. One tap — `None of these` — that asks one question back (`Lighter? More protein? Tell
me what you've got?`) is worth more than the third card, and it is the only honest input to the
section 15 "under 40% = cards are wrong" signal. Without it, a silent close and a happy log look the same.

**No floor on `suggest_meals`.** Section 10 puts a floor on `plan_day` only. But the mama at 6pm with
1,100 calories left is the one who most needs to be told to eat, and the ranker — which prefers scale 1×
(+0.2) and scores protein relative to the allowance — will hand her three 300-calorie plates and call it
a fit. Under is not a failure state the fit rule can see: `mealFitsRemaining` only ever tests the ceiling.
`suggest_meals` needs a floor, or at minimum a large-gap branch that offers a proper plate and says so.

**Nothing about the end of the day.** Everything is logged, it is 9pm, she opens the coach. The plan has
no answer. That is the last thing she sees before bed, most days, and "That's your day. Nice work." — the
mockup's line — is worth writing into the spec rather than leaving to the model.

**Accessibility.** The mockup is `div onclick` throughout. This repo is not: real `<button>`s,
`aria-label`, `role="option"`, visible focus rings from `Fonts.jsx`. Card body → detail sheet must be a
button, and the sheet needs focus trapping and escape — which PR 332 already built
(`src/lib/decidePointerTrap.js`, with tests). One more thing that dies if we branch fresh from `main`.

**The save contract.** PRs 337 and 338 hardened *every* mama-facing log Save after two incidents where a
missing return value looked like success, and `src/components/logSaveContract.test.jsx` is the regression
wall. The coach adds three new save paths — Log it, Ate it, Pencil in. All three must use
`logSaveSucceeded(ok)` and all three must be added to that test file. The plan does not mention it, and
this is precisely the class of bug that file exists to catch.

---

## 16. Answers to section 17

| # | Question | Answer |
|---|---|---|
| 1 | Share the engine between `src/utils` and `functions/_shared`? | Neither, mostly. Run the deterministic engine **client-side** (section 2). The server needs a small validation subset; duplicate that with an equality test in the `RECIPES`/`CALLIE_RECIPES` style. |
| 2 | Runtime limits for the tool loop? | Not the binding constraint — existing handlers already hold 55s upstream timeouts. **Latency** is the constraint. Cap at 2 hops and let the local path carry the common question. |
| 3 | Can `callOpenRouter` pass `tools`/`tool_choice` as-is? | No. Small addition. Pin one model for the tool loop; do not let it walk the `models:` fallback chain mid-loop. Degrade to deterministic, not to another model. |
| 4 | Is `'coach'` safe in `meal_logs.source`? | **No.** `source` is derived from `via` on every write and rewritten on every edit; the value is dropped in silence. Add `meal_logs.origin text`. Section 4. |
| 5 | `custom_meals.steps` text or jsonb? | Text, newline-separated, matching `ingredients`. Add it through `saveCustomMeal`'s graceful-degradation pattern. Note only 109 of 1,206 `custom_meals` carry ingredients today (9%) — the plan's ~8.5% estimate is accurate, and the flywheel argument for saving generated meals with ingredients and steps is the right one. |

---

## 17. Revised slice plan

**Coach 0 — port and reconcile.** Rename `decide*` → `coach*` from PR 332 with tests. Reconcile against
section 6: fix the protein ceiling, pin the tight-one denominator, adopt `formatRangeProgress`, drop the
dead second gate. No UI. Entirely pure functions, entirely under test, zero blast radius. This is the
slice that makes every acceptance string in section 14 assertable before any of it is on screen.

**Coach 1 — the local loop.** Today block, Coach tab, context strip, cards, detail sheet, Log it, Pencil
in, Save to My meals, `Plan my day`. **All of it deterministic and local.** `meal_logs.origin` migration,
`custom_meals.steps` migration, `profiles.timezone` write, `calliePrinciples.js` consolidation, the three
new rows in `logSaveContract.test.jsx`, events. No `/api/coach`, no model, no transcript. This is a
complete, shippable, genuinely instant product on its own, and it is the half that carries the value.

**Coach 2 — conversation.** `coach_messages`, `/api/coach`, the state block, the tool loop, memory, the
cap. The model layer lands on top of an engine that is already proven in production.

**Coach 3 — handoff and triage.** Bot profile, `kind='handoff'`, `incomingSenderLabel`, notify routing,
admin `Needs me`, `coachTriage.js`, floors, `coach_guardrail`. Held back deliberately: this one touches
`messages` RLS and Callie's inbox, and it should not ride along with a first release.

**Coach 4 — photos and Callie's tools.** As the plan's Coach 3.

The reordering is the point. The plan's Coach 1 bundles a new tab, a new API, a new model integration,
seven schema changes, and a new engine into one slice. Splitting the deterministic half from the model
half means the riskiest, slowest, most expensive part of the feature is not blocking the part that
actually makes a mama's Tuesday easier.

---

## 18. For Callie, before Coach 0

Three of these are blockers, not preferences.

1. **Is the top of the protein range a wall?** If a meal puts her at 169g against a 140–150g range, is
   that a meal the coach should refuse to show? My read of everything in the prompt files is no — protein
   is the win — but the shipped fit rule says yes, and the coach cannot ship until one of them changes.
   *(Blocker. Section 1.)*
2. **Which two tab labels can be shortened?** Five tabs do not fit at 390px. *(Blocker. Section 7.)*
3. **The handoff copy and the floors.** This is a postpartum population and the coach will be the first
   responder to "I've been dizzy." The holding line, the triage list, what "stays off the topic" means
   and for how long, and whether a not-medical-advice line needs to be visible somewhere. *(Blocker
   before Coach 3, and Callie's alone to write.)*
4. Would she use a per-mama `coach_guardrail` line if she had one? *(Section 6.)*
5. `CALLIE_PRINCIPLES` and `CALLIE_VOICE` in her own words — currently scattered across
   `clientMealIdeaPrompt.js`, `mealPlanPrompt.js`, and `foodPrefs.js`.
6. The section 12 fixed strings, and whether the coach may quote `coach_note` back verbatim.
