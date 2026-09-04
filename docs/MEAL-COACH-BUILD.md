# Meal coach — what shipped

**Companion to** `docs/COACH-PLAN-REVIEW.md`, which argued about what to build. This one records what
was actually built, why each decision went the way it did, and the questions Callie still has to answer.

The purpose, in Patrick's words: *"the main purpose of the coach is to guide decision making when it
comes to meals. We don't want women to be stuck."* The app is already good at logging. It has never
been good at telling a mama what to do about the meal in front of her.

---

## The one-line version

The coach answers "what should I eat?" from the phone she is holding, in the frame she taps, using her
approved ranges, today's log, her week plan, her food preferences and 28 days of history. A model is
called only for the questions the device cannot answer — a menu photo, a fridge photo, or free text the
router doesn't recognise. Anything that is Callie's is refused before a model is called at all.

---

## Two layers, and which one runs

### Layer 1 — the device (no network, no spinner, no cost)

`buildCoachAnswer` in `src/utils/coachSession.js` is the whole coach for the common case.

```
targetBands(macros)            her approved ranges
  → remainingForCoach(totals)  what's left today
  → computeSlotBudget(...)     what THIS meal can afford, holding back for the ones still ahead
  → rankBankCards(...)         3 cards from Callie's bank + My meals + pantry, portioned to fit
  → coachLines / coachVoice    the words
```

Everything it needs is already loaded into `ClientApp` before the coach tab is drawn, so opening the
tab renders an answer rather than a loading state. This is the engine from PR 332 ("Help me decide"),
ported to `coach*` names and reconciled with the two bugs the plan review found — it arrived with
~940 lines of tests, and rebuilding it would have been the single worst decision available.

Typed questions get the same treatment where possible. `localCoachIntent` (`src/utils/coachIntent.js`)
recognises "what should I eat", "dinner?", "what should I snack on", "lighter", "more protein", "none of
these", "how's my day looking". Those never touch the network. The router is deliberately strict: a
message carrying detail of its own ("what should I eat, I've only got chicken") falls through to the
model rather than being answered from a guess at what she meant.

### Layer 2 — the model (`/api/coach`)

Three modes: `ask` (free text the router didn't recognise), `menu` (a photo of a menu → what to order),
`kitchen` (a photo of the fridge or pantry → what to make). 30 calls per rolling 24h via `estimate_calls`,
same mechanism the rest of the AI surface uses.

The model is never the source of truth for a number. It proposes meals; `buildSuggestedCards` re-runs
them through the same fit check and portioning as a bank card, and one that no longer fits is dropped
rather than shown with a caveat.

---

## Callie's principles, encoded

These are the ones I could read off the existing app and content. Everything in "Questions for Callie"
below is a place where I had to make the call myself.

**Protein is a floor, not a ceiling.** This is the single most consequential decision in the build. The
existing `mealFitsRemaining` treats every macro as a ceiling, which is right for a day-level "will this
fit" check and wrong for a coach. Under it, a 45g-protein chicken bowl is rejected for a mama who has
120g of a 140–150g range logged — the exact meal she should be shown. `budgetAsRemaining` sets protein
to `POSITIVE_INFINITY` for the coach's fit check; calories, carbs and fat stay real ceilings and they
already bound how much protein a plate can carry. Where a card does run past the top of her range, the
card says so (`Puts you over the top of protein, which is fine`) rather than hiding it.

**One day doesn't change anything.** Over her ranges, the coach doesn't scold and doesn't show her a
budget of zero. It switches to light, protein-forward cards and says why.

**Never invent a number.** Model-returned macros have to survive 4/4/9 arithmetic (`macrosPlausible`)
before they can become a card, and anything built from a photo is labelled a rough estimate on the card
face, permanently — not in a tooltip. If the photo can't be read, the coach says so instead of guessing.

**The words are Callie's.** Every string lives in `src/content/coachVoice.js` with the house rules at
the top: no guilt, no exclamation points, no emojis, never "cheat", never "just", never call the coach
an AI. She can edit that one file without touching a component.

**Food for the time of day it actually is.** The deterministic engine ranks by slot affinity, and the
model is told in its own paragraph which meal it is answering for (`slotBlock` in `coachPrompt.js`).
Naming the slot once inside the budget heading was not enough in practice: asked for other breakfast
ideas, the model offered a pan-seared salmon dinner that fit the numbers perfectly.

**No fake intimacy.** A "knows you" chip appears only when it's true — she has eaten it at this meal 3+
times, it matches a stated like, it was pencilled in earlier. An earlier draft fell through to "Close to
what you usually eat" when nothing was known, which for a week-one mama is a sentence about a history
that doesn't exist. No chip is a fine outcome.

---

## Guardrails

Two layers, neither trusted alone, plus a third the model itself can trigger.

`classifyAsk` (`functions/_shared/coachGuardrails.js`) runs **before** any model call — in the browser,
so the refusal is instant and free, and again on the server, where it can't be skipped by editing a
request.

| Scope | What it catches | What happens |
| --- | --- | --- |
| `urgent` | symptoms, medication, diagnoses, pregnancy, mental health, restriction/ED language | Refused. Never softened, never paired with cards. |
| `ranges` | "can you lower my carbs", "why are my macros this" | Refused — her numbers are Callie's to set. |
| `weight` | the scale, plateaus, "how fast will I lose" | Refused. |
| `admin` | billing, refunds, cohort dates, approval, login | Refused. |
| `off_topic` | workouts, sleep, the baby, "write me a…", general knowledge | Refused. |
| `supply` | milk supply, specifically | Cards still come; one honest line and an Ask Callie button ride along. |
| `food` | a food word is present | Answered. |
| `unclear` | no refusal matched and no food word either | Goes to the model, which is told to hand back anything that isn't food. |

That last row is the judgement call worth flagging. "Is Chipotle ok tonight?" contains no food word.
An early version refused it, which fails the mama at the exact moment she opened the coach. The four
refusal lists carry the guarantee and run first; anything arguable goes to the model with instructions
to return `scope: "callie"` if it isn't food. Being wrong toward "let the model look at it" costs one
call. Being wrong the other way costs her trust in the feature.

Every refusal ends the same way: Callie's line, and an **Ask Callie** button. That button is not a bot
writing to Callie. It drops the mama's own question into her own message composer, prefixed, and
switches her to Messages — she presses send. No bot account, no message written on her behalf, nothing
new reading her DMs.

After the model returns, `replyIsClean` drops any reply that restates her ranges, hedges like a chatbot
("as an AI", "consult your doctor"), or uses the word "cheat".

---

## What she can do with a card

Every action goes through the write path the rest of the app already uses, and follows the log-save
contract (`src/utils/logSave.js`): only an explicit `true` clears the button, so a failed write can
never look like a logged meal. Covered in `src/components/logSaveContract.test.jsx` alongside every
other log surface.

- **Log it** → `logRecipe` → `meal_logs`, with `origin='coach'` and `via` still describing how the
  macros were arrived at (a bank card logs exact, a menu-built card logs as an estimate).
- **Pencil in** → a `client_week_plans` entry with `via='coach'`. The budget then reserves that meal's
  real macros for its slot instead of a generic share, and offers "Ate it" later.
- **Save to My meals** → `custom_meals`, now including `steps`, so a coach-built recipe can be made again.
- **See recipe** → the full ingredient list and method, for bank meals and coach-built ones alike.
  Something off a menu says **How to order** instead, and the sheet behind it lists the ordering asks
  — what to leave off, what to get on the side — because the restaurant is doing the cooking.

A card carries the slot it was sized for. She asked about dinner, went to Messages, came back, the panel
had reset to breakfast — and the dinner she logged from the card still in front of her filed under
breakfast. The slot is stamped on the card at build time now.

**Attaching a photo.** One paperclip, one picker: camera, library or files, whichever she has the shot
in. It carried `capture="environment"` at first, which sends iOS straight to the lens with no way back
to a menu she photographed at the table an hour ago.

### The composer sits at the bottom of the scroller

`Shell` takes `flushContent` for this tab, and the composer supplies the bottom spacing itself. A
`position: sticky` footer pins inside its own containing block, so it stops at the scroller's *content*
edge — the shell's 20px of padding below that stayed a live window, and the thread could be watched
sliding through the strip under the composer. Stretching the footer over it does nothing: sticky clamps
the margin box, so a negative bottom margin moves the painted edge nowhere. The padding has to go.

---

## Schema

Two migrations, both applied.

`20260904060000_meal_coach.sql`
- `meal_logs.origin` — where the row came from. `via` was already taken by *how the macros were derived*,
  and the plan's `source='coach'` would have been silently dropped by `db.addMealLog`, so coach
  attribution would have measured nothing.
- `custom_meals.steps` — so "Save to My meals" keeps the method, not just the macros.
- `coach_messages` — the thread, RLS-scoped to the owner, with `local_date` so a day's conversation
  starts clean.

`20260904071500_coach_messages_seq.sql`
- `coach_messages.seq` — identity column. `created_at` ties when a question and its answer are inserted
  in the same tick, and the thread came back on reload with the answer above the question. Writes are
  also serialised through a promise chain in `App.jsx`.

---

## What it deliberately doesn't do

- **It has no opinion about her weight, her ranges, or her body.** Not a limitation to work around later;
  it is the thing that keeps the program Callie's.
- **It doesn't chat.** There is no personality to explore, no memory across days beyond her log. The
  thread resets daily because the question is always "what about this meal".
- **It doesn't proactively message her.** No notifications, no nudges. She opens it when she's stuck.
- **It doesn't write to Callie.** See above.
- **It doesn't invent a meal when the bank has one.** The model is the last resort, not the first stop.

---

## Watching it

- `origin='coach'` on `meal_logs` answers the only question that matters: *did the suggestion get eaten?*
  A coach with high engagement and no logs is a toy.
- `estimate_calls` with `type='coach'` is model spend, and the gap between coach sessions and coach calls
  is how well the local router is doing.
- `ai_failures` with `label='coach'` catches model and parse failures.
- Worth adding once there's traffic: the rate of `deflect` responses. A high one means the guardrails are
  refusing things they shouldn't, and that's invisible unless it's counted.

---

## Questions for Callie

Answers to these change copy and thresholds, not architecture — the build doesn't wait on them. Grouped
by what each one moves.

### How she'd actually answer these

1. A mama has 600 calories and 55g of protein left, it's 8pm, and she's out at a restaurant with no
   nutrition info. What do you tell her? (This is the single most common coach question and I want your
   sentence, not mine.)
2. She's 400 calories over and asks if she should skip dinner. What do you say, word for word?
3. She asks "is X ok?" about a specific food — pizza, wine, a protein bar. What's your actual answer
   shape? Right now the coach fits it into what's left rather than judging the food, and never says a
   food is good or bad.
4. She's under her calories at the end of the day but hit her protein. Eat more, or leave it?

### Thresholds I picked and would rather you set

5. **Protein over the top.** The coach flags a meal that would take her past the high end of her protein
   range with "puts you over the top of protein, which is fine". Is that the right posture, and is there
   a point where it stops being fine?
6. **Portion scaling.** The coach will offer 1.5× or 2× of a bank meal when a single serving leaves her
   short on protein. Is doubling a recipe something you'd suggest, or does that read wrong?
7. **Half portions.** Same question downward: is "half portion" a thing you'd say, or would you rather it
   suggested a different meal entirely?
8. **Meal splits.** With no history, the coach reserves 24% breakfast / 30% lunch / 38% dinner / 8% snack
   of her day. After ~5 slotted days it uses her own median split instead. Do those starting numbers
   match how you'd have a mama spread her day?
9. **Snacks.** It assumes one snack a day when reserving room. Right?
10. **A skipped meal.** If she never logs breakfast and asks about lunch at 1pm, the coach currently
    treats breakfast as skipped and gives lunch the room. Or should it hold breakfast's share in case
    she eats late?

### Where the line is

11. Which of these do you want the coach to answer, and which are yours? Alcohol. Coffee/caffeine.
    Intermittent fasting. Artificial sweeteners. Eating back exercise calories. Right now it answers
    the first four as food questions and refuses the last one as fitness.
12. Anything about milk supply currently gets her cards **plus** a line saying supply is your area. Too
    cautious, or right?
13. A mama says "I feel awful about what I ate today". That's not a food question and not a medical one.
    Right now it hands her to you. Agreed?
14. Is there any question you would rather the coach **always** hand to you, even when it could answer it?

### Voice

15. Read `src/content/coachVoice.js` top to bottom — it's every word the coach can say, in one file.
    Mark anything that doesn't sound like you. The house rules at the top (no exclamation points, no
    emojis, never "cheat", never "just") are my read of your existing copy; correct them if I'm wrong.
16. Should the coach have a name, or stay "Coach"? A name invites a relationship with something that
    isn't a person, which is the thing we're trying not to do — but "Coach" is a little cold.
17. When it hands off, it says things like *"That one's Callie's. She knows your history and I'd only be
    guessing."* Does referring to you in the third person read right, or would you rather it said "I'll
    pass that to Callie"?

---

## What I'd build next

In rough order of what I think each is worth:

1. **The Today entry point earning its place.** It's a card that says "not sure what to eat?" Once there's
   real usage, the interesting version knows *why* she's stuck — 40g of protein left at 8pm is a different
   card from an untouched day at 9am.
2. **Eating-out without a photo.** "I'm going to Chipotle" should be answerable from a small set of
   common chains without asking for a menu photo. Today it needs the photo.
3. **Counting the deflections.** See "Watching it". Guardrails that are too tight are the most likely way
   this feature quietly fails, and right now nothing would tell us.
4. **A weekly read.** "You hit protein 5 of 7 days" is the kind of thing that makes a subscription feel
   worth keeping — but it needs Callie's voice on it first, and it's adjacent to progress, which is hers.
