# Quiz lead nurture — from submit to last email

The ranges quiz at `/quiz` is a lead magnet with two jobs: show her preview bands on the page, then keep emailing until she joins, unsubscribes, or the sequence ends. The page and the inbox are the same offer, written in Callie’s voice.

Related: `docs/RANGES-QUIZ.md` (engine, env, Meta rules). Source files: `marketing/public/quiz-app.js`, `functions/api/lead.ts`, `marketing/src/lib/quizDrip.mjs`, `src/content/emailCatalog.js`.

## How she gets to submit

The quiz is seven questions, then an email gate, then results. Progress is 9 steps (`q1` → `result`).

**Q1 — “Where are you right now?”**
Still pregnant · 0–3 months · 3–12 months · 1–2 years · 2+ years · Not postpartum.

That one answer forks the rest of the product:

- **Still pregnant** skips every other question and goes straight to the email gate. No height, weight, or flags. Title: “Leave your email — pregnancy season first.” Button: **Submit**.
- **Not postpartum** skips feeding and jumps to height/weight.
- Every other postpartum option asks feeding next (exclusive / combination / weaning / not feeding).

Then: height + current weight (or a range), goal weight, goal (lose / maintain / gain), activity, optional flags (vegetarian, fully vegan, blood sugar, thyroid, recent C-section).

The **email gate** for everyone else is: “Your ranges are ready. Where should Callie send them?” First name + email. Button: **Show me my ranges**. A hidden honeypot field kills bots.

On submit, `quiz-app.js` POSTs to `/api/lead` with answers plus fresh `_fbp` / `_fbc` cookies and any stored `fbclid` / `utm_*`. The server recomputes the math; the browser does not get to invent the bands.

## What happens the instant she submits

`POST /api/lead` (`functions/api/lead.ts`) does four things:

1. **Rate-limits** the IP (8/hour, KV). Disposable inboxes are rejected.
2. **Segments** her and upserts `marketing_leads`. Re-quiz updates the row, but **pregnancy** and **fully vegan** are sticky: a later “normal” quiz cannot unlock the $249 rate after those exits.
3. **Fires Meta Lead** (pixel + CAPI) only for enrollable, non-vegan segments (`main`, `early_pp_nurture`). Pregnant / vegan fire a custom `QuizNurture` event instead. Pixel `custom_data` is only `content_name: ranges_quiz` — no feeding, months, or flags.
4. **Sends email #1 immediately** via Resend (`quiz_ranges`), from Callie, reply-to `calista@nourishwithcalista.com`, with unsubscribe + `List-Unsubscribe`. That send is logged once so the drip can see it. Re-taking the quiz can resend the email; it does **not** restart the drip clock.

If `/api/lead` fails, the page still shows a local fallback payoff so she is not stuck — but then `leadSaved` is false, so the page tells her we could not email the numbers.

### Four segments (this decides page + emails)

| Segment | Who | Qualified for $249 / Meta Lead? |
|---|---|---|
| `main` | Most postpartum / not-postpartum answers | Yes |
| `early_pp_nurture` | 0–3 months | Yes (softer “supply-aware” copy) |
| `pregnancy_nurture` | Still pregnant | No |
| `waitlist_plantbased` | Fully vegan flag | No |

Vegetarian / pescatarian is only a stored flag. **Fully vegan** is the plant-based exit.

The engine can also mark `needs_review` (maintain/gain, thyroid, goal BMI under 19, aggressive cut, carbs under 100g). The **results page still shows preview bands** (`skipReview`). Callie is supposed to approve finals if they join.

Checkout later reads this row: `/api/checkout` only charges **$249** when `marketing_leads` has an eligible segment for that email. Same email is required so the unlock sticks.

## What she sees on the results page

Rendered by `renderResult()` in `marketing/public/quiz-app.js`. Two completely different pages.

### Pregnant: short, no sell

Title: **“You're in an abundance season.”**

Copy: congratulations, we are not building cut ranges while she is pregnant, she is on a gentle list, ranges will be here when she is postpartum.

One button: **Back home**. No ranges card, no app tour, no $249, no sticky checkout.

### Everyone else (including vegan and “needs review”)

Title: **“[First name], your ranges are ready.”**

Then, in this order:

1. **One preview sentence** (the only “these are not finals” line allowed on the page):
   *“A preview built from your answers. If you join the 8 weeks, Callie builds and approves your final ranges herself before day one.”*

2. **Unsaved note** only if the API failed: numbers are on the page, we could not email them.

3. **Vegan banner** (fully vegan only): the program emphasizes animal protein; hitting these targets vegan is hard; reply to the email if she wants to talk. No hard sell.

4. **Ranges card** (app-style):
   - Badge “Your ranges”
   - “Live inside the bands. Busy, active day? Eat the top. Slow day? The bottom. Both count as a win.”
   - Four rows with the pink band motif: Protein, Carbs, Fat (each `low–high g`), then “Calories land around `low–high`”
   - A feeding line under the card when she is postpartum, e.g. exclusive: *“You're producing roughly 25 ounces a day. That's about 450 calories…”*
   - If there are no numbers at all: “Check your inbox… You can still lock your spot below.”

5. **App tour** (interactive tabs, not a live login):
   - **Today** — Snap / Describe / My plan / Macros, two sample logged meals, running totals, water
   - **Meals** — recipe card (protein oatmeal) + “Add to Today”
   - **Messages** — a 1:1 bubble with Callie about a blown week, plus “not a chatbot”

6. **Fast offer** (right under the tour, before social proof):
   - “Your quiz unlocked the early rate”
   - `$249 · $50 off the full $299 · the Aug 31 group, capped at 50 mamas`
   - Pink button **Lock my spot · $249** → `/join?from=quiz&email=`
   - “Doors close Aug 27. Not ready? Your ranges are already in your inbox.”

7. **Callie block** — kitchen photo, “Certified functional nutritionist · blood chemistry certified · mama of two,” plus her 1:1 quote.

8. **Three member pulls** (Becca, Lauren, Coti) and “Every mama's results are her own.”

9. **Full offer card** (the thing the sticky bar hides when this is on screen):
   - “Exclusive · early rate from your quiz”
   - “Ready to lock your Aug 31 spot?”
   - Price row $249 / Full $299 / Save $50
   - “$31/week for 8 weeks”
   - **Pre-pay $249 — lock my spot**
   - “Continuing as [email]”
   - After you pre-pay: password + short intake; Callie builds in queue order
   - Soft skip: ranges stay in the inbox (or screenshot them if email failed)

10. **Sticky bar** after she scrolls past the ranges card and the bottom offer is not in view: “Doors close Aug 27 · 50 mamas max” + **Pre-pay $249**. Same `/join` link.

Vegan still sees this whole payoff. The honesty banner is the only extra. Pregnancy is the only segment that strips the sell.

## How we nurture after that (Track A)

Two tracks. They never mix.

- **Track A** = quiz only, no `profiles` row. This is the quiz-lead nurture.
- **Track B** = she created an account. Finish-joining emails take over; the quiz drip **stops immediately**.

Hourly cron: `POST /api/email-cron` (`functions/api/email-cron.js`). Decisions live in `marketing/src/lib/quizDrip.mjs`. Clock starts at the first logged `quiz_ranges` send (or lead `created_at` if that log is missing and the lead is less than 8 days old).

### Sales leads (`main` and `early_pp_nurture`) — three emails, then stop

**#1 — Immediate: “Your ranges, [First name]”** (`quiz_ranges`)

Same numbers as the page. Early-PP adds a supply-aware preview line. Needs-review adds that Callie will still look at finals. Then the $249 offer block, “Lock my spot · $249,” and “use this same email so your ranges stay attached.” Branded template + footer unsubscribe.

**#2 — +2 days: “[First name], the numbers are the easy part”** (`quiz_drip_2d`)

Not a second numbers dump. Subject is different on purpose so Gmail does not thread it under #1. Pitch: ranges are a starting point; the program is the weekly check-in when milk/sleep/appetite change. Doors close Aug 27, start Aug 31. Same $249 + join CTA.

**#3 — Last: “[First name], still want in?”** (`quiz_drip_7d`)

Due at **+6 days, or Wednesday Aug 26 PT, whichever comes first**. Never sent on or after **Aug 27 PT**. If both #2 and last are due in the same cron tick, **last wins** — we do not dump two emails at once.

Body: last note, doors close, start Monday, reply if she has a question. Reuses the same $249 offer block as email #1. Then stop.

A new sales lead in the last days before doors close typically gets #1 immediately and the **last** email on Aug 26, and skips the +2-day note.

### Pregnancy — two emails, no checkout

**#1 — Immediate: “[First name], a note for this season”**
Congratulations. Pregnancy is abundance, not a cut. No ranges. Promises a light follow-up.

**#2 — +3 days: “[First name], whenever you're ready”** (`quiz_pregnancy_note`)
Keeps the promise. No $249, no join button. Eat enough, rest, come back postpartum. Then stop.

### Fully vegan — first email only

**#1** can include her bands, plus the honesty note on animal protein, plus “reply if you want to talk. No hard sell.” **No drip.** Catalog note: plant-based gets the first email only.

### What kills the drip

Any of these, checked every hour:

- She unsubscribes
- She creates an account (`profiles` row, or any finish-joining / welcome event) → Track B owns her
- She pays
- Segment is plant-based
- Last sales email already sent, or doors are closed (Aug 27+)
- No drip anchor (very old lead with no `quiz_ranges` log)

Callie can see the schedule on Admin → Leads (`planLeadDrips`). She can also send a personal note; that is outside the automated sequence.

## If she actually starts an account (Track B, not the quiz drip)

The quiz sequence ends. Unpaid account emails:

1. **+1 hour** — “Your spot's waiting, mama”
2. **+24 hours** — same subject, different body
3. **Last note** — “[First name], last note from me” on Aug 26 PT only

$249 appears in those emails only if the quiz unlock is still true. CTA prefills `/join?email=`.

If she pays, nurture leaves sales and becomes onboarding: welcome → intake reminders (+24h / +72h) → intake received → macros live. That is a different journey.

## One-line map

```
/quiz answers
  → email gate
  → POST /api/lead  (row + segment + email #1 + Meta)
  → results page
       pregnant: abundance copy, home
       else: ranges + app tour + $249 payoff
  → hourly cron
       sales:  +2d  then last (Aug 26 or +6d)
       pregnant: +3d soft note
       vegan:    stop after #1
       account:  jump to finish-joining, kill quiz drip
```
