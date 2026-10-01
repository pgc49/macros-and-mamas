# CRM data model and stage logic

Investigation of the live Macros and Mamas admin / funnel model (30 Aug 2026). Two identities exist today: a **quiz lead** (`marketing_leads`) and an **account** (`profiles`). Stages, leftover, and drips are computed in JS, not stored as one CRM status.

Live snapshot (not product constants): 74 quiz emails, 70 non-admin profiles, 0 unpaid accounts, 0 `refunded` profiles, 5 comps, 48 paid profiles with **no matching quiz email**.

Leftover-first Leads shipped in [#304](https://github.com/pgc49/macros-and-mamas/pull/304) (`91b49a8` on `main`).

Questions 1–18 are the CRM data model. Questions 19–23 are AI summary infra. Questions 24–31 are homepage / enrollment copy.

---

## Data model and stage logic

### 1. Tables / columns

There is **no `leads` table** and **no `cohorts` table**. `supabase/schema.sql` is a subset; columns below are from the production project plus migrations.

**`marketing_leads`** — one row per unique `lower(email)` (`UNIQUE (lower(email))`). Written by `/api/lead` (service role). Quiz answers + computed ranges + Meta attribution.

```sql
id uuid PK, created_at, email, first_name, last_name, source, quiz_version,
months_postpartum, feeding_status, height_in, current_weight_lbs, goal_weight_lbs,
goal, activity_level, flags[], baby_birthday,
protein/carbs/fat/calorie bands,
needs_review bool, review_reason, segment default 'main',
fbp, fbc, event_id, utm_*, landing_path, referred_by
```

**`profiles`** — one row per `auth.users.id` (created on signup). Account, payment, intake gate, cohort stamp.

```sql
id uuid PK → auth.users,
email, name, last_name, phone, age, date_of_birth,
current_weight, goal_weight, months_pp, breastfeeding, pregnant,
goal, activity, stress, insulin_resistance, diet, pref_*, season_note,
allergens[], coach_note*,
role default 'client', status default 'pending', week default 0,
paid, paid_at, refunded, comp, stripe_customer_id, stripe_payment_intent,
lab_review_purchased*,
utm_*, fbclid, landing_path, referrer_host, anon_id, attributed_at,
ambassador, cohort_label, tier (membership_tier),
stripe_subscription_id, subscription_status, subscription_*_end,
subscription_cancel_at_period_end
```

**`macros`** — intake artifact. Presence = “has intake.” `approved` + `profiles.status='active'` = Callie approved.

```sql
profile_id PK → profiles, cal, protein, fat, carbs, notes jsonb, approved bool
```

**Payments / refunds**

- `refunds` — log: `profile_id, reason, amount_cents, stripe_refund_id, stripe_payment_intent, created_at`. No client code writes it today.
- `stripe_events` — webhook idempotency (`event_id`).
- Enrollment refund flag is `profiles.refunded` (0 live rows). `/api/refund` is **disabled** (403). `charge.refunded` only reverses **referral credit**, not `profiles.refunded`.

**Waitlists (not the Leads list)**

- `waitlist` — eligibility hold (`pregnant` / `early_nursing`).
- `cohort_waitlist` — homepage list; `cohort` text default `'cohort_2'`.

**Email / messages**

- `email_events` — send log: `profile_id` (nullable), `email_type`, `to_email`, `subject`, `resend_id`, `status` (`sent`/`failed` only), `meta`, `created_at`.
- `email_unsubscribes` — `email` PK.
- `messages` — 1:1 DMs: `client_id`, `sender_id`, `body`, `read_at`, `kind`, attachments, `deleted_at`.
- `referrals` / `referral_codes` — promo join; `referred_email` + `referred_user_id`.

Join from lead → account is **JS `lower(email)`**, not a FK.

### 2. What computes those labels (all client JS)

| Label | Meaning | Where | Rule |
|---|---|---|---|
| **Still in play / leftover** | Quiz complete, no payment | `isLeftoverLead` in `src/admin/quizLeads.js` | `funnelStatus` is `quiz_only` or `signed_up_unpaid`. Funnel: no profile → quiz only; profile unpaid → signed up unpaid; `paid`/`paid_at` → paid. Default Leads filter after #304. |
| **Needs review** | Quiz math/Callie eyes, **not** a roster queue | Written at quiz submit in `marketing/src/lib/rangesEngine.mjs`; stored on the lead | `incomplete_inputs`, `goal_maintain`/`goal_gain`, `thyroid`, `goal_bmi_under_19`, `goal_over_25pct_below_current`, `carbs_under_100`. Pregnancy segment skips review. Shown as a tag, not a chip. |
| **Need intake** | Paid, no `macros` row | `src/db/db.js` `loadAdminRoster` | `paid && !hasIntake` → `stage = paid_awaiting_intake`. Clients chip `awaiting_intake`. |
| **Need approval** | Paid + intake, not approved | same | `paid && hasIntake && !approved` → `awaiting_approval`. `approved` = `macros.approved` **or** `profiles.status === 'active'`. |

No SQL view and no API field named leftover / still-in-play / need-intake. Cron uses the same facts (`paid`, macros presence) independently.

### 3. Can we derive a single pipeline stage?

**Existing stages** (`signed_up` / `paid_awaiting_intake` / `awaiting_approval` / `active` / `refunded`) are already a pure derivation on **accounts**. Do not add a stored status for those.

The CRM stages (new lead / nudging / cold / paid-needs-setup / active / alumni) mix **leads + clients**. Derivable **if** you define a person key and accept holes:

| Proposed | Derivable from | Breaks |
|---|---|---|
| new lead | leftover + no drip sent | Retakes overwrite `created_at` on the same email. |
| nudging | leftover + remaining Track A / finish-joining | Next send is **computed**, not stored. Plant-based leftover is leftover but has **no** sales drip. |
| cold | leftover + last `email_events` older than N / unsubscribed | No last-touch column. No “Callie viewed card” event. |
| paid-needs-setup | roster `paid_awaiting_intake` + `awaiting_approval` | Comps are `paid` without Stripe (`isStripeCollected` excludes them from Paid chip). |
| active | `paid && approved && !refunded` | `profiles.week` is often stuck at 1; live week is calendar from `cohort_label`. |
| alumni | `isProgramComplete(cohort)` and/or `tier`/`subscription_status` | Alumni is a **membership gate**, not a roster stage. Missing `cohort_label` → access stays open (`program_dates_unset`). |

**Edge cases that break a naive derivation**

- **Paid without quiz:** ~48 paid profiles have no `marketing_leads` row (founding pre-quiz, different email). They never appear on Leads.
- **Quiz without account:** leftover (51-shaped). No `profiles.id`.
- **Two emails:** two people. No identity graph.
- **Manual/comp adds:** `comp=true`, may skip Stripe; still `paid`.
- **Refunds:** `profiles.refunded` exists, **0 live**. Stripe refund does **not** set it. `refunds` table is unused by app code.
- **Sticky nurture:** retake cannot leave `pregnancy_nurture` / `waitlist_plantbased`.
- **Admins:** roster forces `active` if they have approved macros.

A new `pipeline_status` column is only worth it if Callie will **override** (mark cold, snooze). Otherwise a server view over leads ⟕ profiles ⟕ last email ⟕ macros is enough. Backfill is not required for the labels you already have.

### 4. Dedup

**Email is the unique key for quiz leads.** `UNIQUE (lower(email))`. Retake **PATCHes** the same row (answers/ranges/UTMs overwrite; `created_at` is first insert — comments say “never last quiz”). Pregnancy/plant-based **stick**.

Accounts are unique on **auth user id**. Lead↔account join is `lower(email)` in `enrichQuizLeads`. Referral is a **second** email-keyed table (`referrals.referred_email`).

Quiz-then-referral: same email stays one lead; source label can stack (`Meta ad · Kristen`). Different emails = two leftover rows.

---

## Priority and queue

### 5. Existing sort (reuse this, don’t invent a second one)

**Leads:** SQL `created_at desc` only. No attention rank. Leftover filter is unpaid; no “stale / no touch” sort.

**Clients** (`filterRoster` / `attentionRank` in `src/admin/clientRoster.js`):

1. Unread mama→Callie
2. Awaiting approval
3. Quiet active (no meal/water/weigh-in yesterday or earlier; 14-day activity window)
4. Active with **never** an admin DM (`!lastAdminAt`)
5. Else oldest `lastAdminAt`, then name

Unpaid-account chip: newest `createdAt`. Active chip: A–Z. Default Clients tab is `needs_you`.

### 6. Last touched

| Signal | Exists? | What it is |
|---|---|---|
| Last email sent | Yes, queryable | `email_events.created_at` by `to_email` / `profile_id`. Not a column on the person. |
| Last in-app message | Yes | `admin_roster_message_stats().last_admin_at` = last **admin→mama** DM. Unread = mama→Callie `read_at is null`. |
| Last mama activity | Yes | `lastActiveDate` = last meal/water/weigh-in in 14 days. Not login. |
| Last admin **view** of a card | **No** | Opening Leads/Clients writes nothing. |
| Device last seen | Push only | `push_subscriptions.last_seen_at` — not CRM. |

**“No touch in 24h”** can be built from `greatest(last email, last admin DM)` for people who have those rows. Missing: Callie viewed, mailto from the phone, personal note copy. Unsubscribed is `email_unsubscribes`, not a touch.

---

## Email / drips (Resend)

### 7. Scheduling

**Hourly cron**, not per-lead jobs and **not** Resend scheduled sends. `POST /api/email-cron` (`CRON_SECRET`; GitHub Actions). Each tick:

- Track A: quiz-only, no profile — `planQuizLeadSends` / `pickDueQuizDripStep` (+2d, last, pregnancy +3d).
- Track B: unpaid **profile** — finish-joining 1h / 24h / close.
- Paid, no macros — intake reminder 24h / 72h.

Sends go through Resend immediately; a row is inserted into `email_events`.

**Next scheduled email** is already displayed on the lead card via `planLeadDrips` (`src/admin/leadDripSchedule.js`) — same rules as cron, remaining list + stop copy. Not a queue table. You can reuse that function server-side for a queue column.

### 8. Stop on pay

Reliable **if** a `profiles` row exists for that email:

- Track A: `profile` present → skip (`has_profile`); `paid`/`paid_at` → `paid`.
- Track B: cron skips `p.paid`.
- Card: `funnelStatus === 'paid'` empties remaining.

Best-effort gaps: cron racing checkout; paid on a **different email** than the quiz (those leftover rows keep Track A); welcome is best-effort on the webhook (`wasPaid` avoids double welcome).

### 9. Opens / clicks / bounces

**Not stored per person.** `email_events.status` is `sent` (1089) or `failed` (1) as of this snapshot. No Resend webhook ingest for open/click/bounce/complaint.

`quiz_signup_bounce` is a **Sentry** beacon on the signup→checkout bounce, not an email bounce.

---

## Messaging

### 10. Unread per person

Yes. `admin_roster_message_stats()` returns `client_id`, `last_admin_at`, `unread_from_mama`. Roster already names people (`unreadFromMama`). Overview badge is a **sum** of inbox unreads — the per-person breakdown already exists.

Quiz-only leftover has **no** `client_id`, so no DM unread.

### 11. Combined timeline

**No.** Emails: `email_events` (lead card + Emails tab). DMs: `messages` (Messages + client card). Different keys (`to_email` vs `client_id`). You can union in app: `created_at` + type. Nothing does that today.

---

## Payments, refunds, program state

### 12. Refunds / alumni / active

- **Pay:** Stripe Checkout → `checkout.session.completed` / async paid → `markPaid` (`paid=true`, `paid_at`, Stripe ids). Does **not** set `status=active`.
- **Enrollment refund flag:** `profiles.refunded`. Auto-refund API off. Live count **0**. `charge.refunded` → referral clawback only.
- **Alumni:** `tier`, `subscription_*` after program (Founding: free month then $49; August+: gate at `programEnd`). `membershipAccess()` — not a Clients chip.
- **Active (coach sense):** paid + approved macros + not refunded.

### 13. Week X of 8

Live week is **`programWeekNumber(cohort_label)`** from the hardcoded calendar (`programStart`). `profiles.week` is written at approve (often 1) and is **not** trusted on the roster.

Progress itself is per-event: `checkins`, `weighins`, `meal_logs`, `water_logs`, week plans — keyed by `week_start` date, not “week 3 of cohort.”

**Rolling starts break:** one `programStart` per `cohort_label`. If two people share `2026-08` but start on different Mondays, Today/Progress/voice-drop week labels collide. You’d need per-person `program_start` (or a real cohorts row + membership).

---

## Cohorts

### 14. How deep

`profiles.cohort_label` is a **text stamp** (`'2026-07'`, `'2026-08'`), not a FK. Calendar lives in `functions/_shared/cohorts.js` and `src/lib/cohorts.js` (must stay in sync). `cohort_waitlist.cohort` is a separate homepage field (`'cohort_2'`).

Stamped at pay (`handlePaidEnrollmentChannel` from `paid_at` window) or kept if already set. Founding was backfilled in migration 048.

Depends on cohort besides admin chips:

- Channel membership (`conversations.cohort_label`)
- Monday voice drops
- Membership / free month / paywall
- Pricing window (`cohortForDate` / `OPEN_COHORT_LABEL`)
- Referrals default cohort `2026-08`
- Week labels on Today / Progress / admin card

### 15. Rolling + auto-tag by paid month

Would need to change:

- `COHORT_CALENDAR` + `openEnrollmentCohort` / checkout stamp
- Channel create-on-pay (today assumes pre-seeded 2026-07 / 2026-08 rooms)
- Welcome is **generic** (no cohort in the template) — copy/scheduling only if you want “your group starts …”
- Voice drops, prompts, `adminCohortName`
- `programWeekNumber` → per-person start
- Content unlock is “approved + paid,” not week-gated by cohort — rolling hurts **labels and community**, not meal-log access

---

## Platform constraints

### 16. Admin frontend

Vite + React 19 + React Router 7. **No component library** — `Card` / `Btn` / `Shell` in `src/components/ui.jsx`, tokens `T` / `F` / `FD`. Admin is lazy-loaded `AdminPortal` (never in the customer bundle).

Nav is **`TabBar` chips** (Overview, Clients, Leads, Credits, Messages, Announcements, Emails), plus a second chip row per tab (Clients filters, Leads leftover chips, `CohortFilterBar`). No bottom nav.

### 17. Auth / Callie vs Patrick

One role: `profiles.role === 'admin'` → `isAdmin`. **No Patrick-specific dashboard.** Both admins get the same portal on `admin.macrosandmamas.com`. On **www** (customer surface) admins stay in the mama app (`homePathFor`). RLS is `is_admin()`. Do not treat `pgchammas@gmail.com` as a throwaway.

### 18. In-flight collision risk

Do not touch **299, 301, 302**. Those plus nearby open work:

| PR | Collision |
|---|---|
| **299** Ready-to-approve interrupt | Same `awaiting_approval` / Clients queue |
| **302** Split Needs you | Same `needsYou` / `attentionRank` |
| **298** Approval weekend heads-up | Email cron / C2 intake |
| **291** Quiz lead nurture overview | Leftover/nurture on Overview |
| **286** Warm Callie lead note | Lead card copy (already shipped a draft) |
| **225** parked messaging merge | Combined timeline (parked) |

#304 leftover-first Leads is **already on main**. Next CRM pass should compose with that (leftover default, cohort chips, nurture tags, no Track A next-send on plant-based), not reopen Leads-as-All.

---

## AI summary infra

### 19. How Snap, Describe, and Suggest my week call the model

All three go through **Cloudflare Pages Functions** → **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`). There is no Supabase Edge Function for these, and no direct Google/Anthropic/OpenAI SDK.

| Feature | Client | Server | Label in `ai_failures` |
|---|---|---|---|
| **Snap** | `MealLogCard` → `POST /api/estimate` `{ type: "photo" }` | `functions/api/estimate.js` | `estimate_photo` |
| **Describe** | same → `{ type: "text" }` (also recipe paste → `type: "recipe"`) | same | `estimate_text` / `estimate_recipe` |
| **Suggest my week** | `WeekPlanner` / `App.jsx` → `POST /api/meal-suggest` | `functions/api/meal-suggest.js` | `meal_suggest` |

Shared client: `functions/_shared/openrouter.js`.

- **Provider:** OpenRouter. Secret: `OPENROUTER_API_KEY`.
- **Model chain:** `google/gemini-3.1-flash-lite` → `google/gemini-3.5-flash-lite` → `google/gemini-2.5-flash-lite`. Optional `MEAL_PLAN_MODEL` becomes primary; the chain stays as fallback. OpenRouter `models` + `provider.allow_fallbacks` plus one app-level retry.
- **Auth:** Supabase JWT. Paid (or admin). Refunded blocked. Mamas rate-limited (`estimate_calls`); admins unlimited.
- **Failures:** `logAiFailure` inserts into `public.ai_failures` (service role). Admin Overview card **AI health · last 24h** reads that table (`src/admin/AdminPortal.jsx`). Also `console.error` on the Function. Sentry is not the AI failure store.
- **Related callers (same path, not Snap/Describe/Suggest):** `POST /api/meal-idea` (single planner meal), `POST /api/meal-plan` (admin draft week), `POST /api/support-digest-cron` (GitHub issue triage). `/api/analyze` is a dead stub that tells clients to use `/api/estimate`.

**Can a per-client summary reuse this path?** Yes. Add a Pages Function that imports `callOpenRouter` / `logAiFailure` / `resolveModels` the same way `meal-suggest` and `meal-plan` do. `meal-plan` is the closer sibling: admin-only, loads one client’s profile + approved macros, fixed prompt, JSON out. Do not reuse `/api/estimate` (vision + food-only prompt) or `/api/meal-suggest` (client-facing week plan + 5/day cap). New label, e.g. `client_summary`, so Overview health stays readable.

### 20. Per-client data queryable in one shot

Already assembled today for the admin client card:

| Data | Where | Cost |
|---|---|---|
| Approved ranges | `macros` (one row) | Cheap. Already on the roster. |
| Logged days vs ranges | `meal_logs` (`date, name, cal, p, c, f, via, slot`) + `macros` | `db.loadClientProgress(id, 28)` already groups meals by date. Compare with `formatRangeProgress` / `rangeState`. |
| Water | `water_logs` by date | Same 28-day progress payload. |
| Habit completion by week | `checkins` (`week_start, item_id, day`) + `custom_goals` | Progress payload returns **all** checkins (not just 28 days) + custom goals. Feed `buildHabitRhythm`. |
| Weigh-ins | `weighins` (`date, weight`) | Already on the roster (`sel.weighins`). |
| Last N DMs | `messages` via `db.loadMessages(clientId)` | Separate query. Cheap at N=20–40. |
| Last email | `email_events` by `profile_id` / `to_email` | Not on the client card today; one extra query. |

**Expensive / skip for a summary prompt**

- Full meal **photos** (not needed; Snap already sent those to OpenRouter at log time).
- Entire DM history or group `conversation_messages`.
- Roster-wide `meal_logs` (already paginated because a cohort exceeds PostgREST’s 1000-row default). Per-client 28 days is fine.
- Token weight: 28 days of meal names + totals + habit % + last ~20 DMs + ranges is plenty. Do not dump `profiles.*` plus every log row.

`loadClientProgress` + roster weigh-ins + `loadMessages({ limit })` is the one-shot. No new SQL view required to start.

### 21. Cache a generated summary

**No cache table today.** Closest objects:

- `ai_failures` — failures only.
- `estimate_calls` — rate-limit log (`profile_id, type, created_at`), not output.
- `profiles.coach_note` — Callie’s human note, trigger-locked so the mama cannot edit it.

Need a **new table** (e.g. `client_summaries`: `profile_id`, `for_date`, `text`, `model`, `created_at`, unique `(profile_id, for_date)`). Do not overwrite `coach_note`.

**Trigger**

- **Generate-on-open + 24h cache** is the natural fit: Callie opens a card rarely; most clients will not be opened on a given day. Reuse `meal-plan`’s on-demand pattern. Cache hit = skip OpenRouter.
- **Daily cron** only if she wants a queue of stale cards waiting. Could hang off the existing hourly `POST /api/email-cron` style (`CRON_SECRET` + GitHub Actions), but that burns tokens for people she never opens.

No existing daily “generate content per client” job. `support-digest-cron` is GitHub triage, not client summaries.

### 22. Habit insight callouts — deterministic

Yes. No model. Logic lives in `src/lib/habitRhythm.js`:

- `buildHabitRhythm(...)` → `steadiest` = program/custom goal with the **highest average % across completed (non-current) weeks** where the goal was active.
- Empty until she has a finished week.
- Chip labels: `goalChipLabel` (`Macros`, `Water`, `Steps`, `Sunlight`, `Home meals`, `Strength`, or a truncated custom title).

UI: `HabitRhythmCard` (`src/components/HabitRhythmCard.jsx`) already has `audience="admin"` copy (“Her steadiest habit: **strength workouts**”). It is mounted from `ProgressCharts`, which the **admin client card already renders** (`AdminPortal` → `ProgressCharts audience="admin"`). Flag chips should call `buildHabitRhythm` + `goalChipLabel` — do not re-derive from raw checkins.

Related but separate: `src/utils/progressSeries.js` (`adherenceForWeek`, 4-week trends). Same checkin facts, different rollup.

### 23. PII / privacy when sending content to the model

**Already happening for AI features (disclosed, incomplete):**

Privacy §3 + §4 (`src/content/privacy.js`) say meal **photos and text descriptions** go to a third-party AI provider for estimates. Terms mention “AI model providers.” Not HIPAA (wellness, not a healthcare provider).

**Already happening, barely named in privacy:**

- **Suggest my week** / **admin meal-plan** send intake: name, age, weights, goal, activity, stress, insulin resistance, pregnant/breastfeeding, months PP, diet, meal prefs, season note, allergens, food avoids, plus approved macros and saved My meals. That is health-adjacent PII. Privacy lists “estimate macros from meal photos and descriptions” and does not explicitly say week-planning sends intake.
- **Support digest** sends GitHub issue text (user-typed from-app reports), not in-app DMs.

**Not happening today:** 1:1 `messages` and group `conversation_messages` are **not** sent to OpenRouter.

**For a client summary:** reuse the meal-plan path (intake + logs + habits) without a new legal surface. Sending **DM bodies** is a new share. If you do it: update Privacy §3/§4, keep it admin-only, send last N messages (not the whole thread), strip attachments, and do not send other mamas’ group posts. Photos stay out. `callOpenRouter` already sends `http-referer: macrosandmamas.com` and an `x-title` — no extra PII there.

---

## Homepage and enrollment copy

### 24. Where deadline / date copy lives

**Not one file.** Marketing has a central config; the SPA has a second; emails and the product calendar hardcode the same dates again.

**Canonical display config (keep in sync)**

| File | What |
|---|---|
| `marketing/src/config.ts` | `cohortStartDate` (`Monday, Aug 31`), `cohortStartDateShort` / `Compact`, `doorsCloseDate` (`Aug 27`), `doorsCloseReason`, prices, `queuePositionCopy` |
| `src/config.js` | `COHORT_START` / `_SHORT` / `_COMPACT`, `ENROLLMENT_OPEN`, `ENROLLMENT_CLOSED_AT`, display price tiers |

**Homepage / marketing components that interpolate those dates or the 50-cap**

| File / component | What it says |
|---|---|
| `marketing/src/components/Hero.astro` | Doors close Aug 27 · group starts Monday, Aug 31 |
| `marketing/src/components/Pricing.astro` | “The August 31 group”, “capped at 50”, `doorsCloseReason`, “starts Aug 31” |
| `marketing/src/components/FinalCta.astro` | August 31 group, capped at 50, doors close Aug 27 |
| `marketing/src/components/StickyCta.astro` | **Sticky footer.** Waitlist: “Doors close Aug 27 · 50 mamas max”. Open: “Doors close Aug 27 / Starts Aug 31 · $299” |
| `marketing/src/components/Faq.astro` | “Groups are capped at 50” (no dates). Lab Review “spots are limited” |
| `marketing/src/components/WaitlistForm.astro` | “starts Monday, Aug 31” |
| `marketing/src/pages/quiz.astro` | Passes `data-cohort-start` / `data-doors-close` into the quiz |
| `marketing/src/layouts/BaseLayout.astro` | JSON-LD `LimitedAvailability` / price — **no dates** |
| `marketing/reference.html` | Old static mock (not shipped) — same dates |

**No countdown.** No `daysLeft` / timer. Sticky bar is static copy.

**Hardcoded elsewhere (not imported from `config.ts`)**

| File | Dates |
|---|---|
| `marketing/public/quiz-app.js` | Fallbacks `Monday, Aug 31` / `Aug 27`; title **“Ready to lock your Aug 31 spot?”**; fast-lane + sticky “Doors close …” |
| `marketing/src/lib/rangesEmail.mjs` | `DOORS_CLOSE = "Aug 27"`, `COHORT_SHORT = "Aug 31"` |
| `marketing/src/lib/quizDripEmail.mjs` | “This group starts Monday, Aug 31” |
| `marketing/src/lib/finishJoiningEmail.mjs` | “We start Aug 31. Doors close Aug 27.” |
| `marketing/src/lib/cohortEmailWindow.mjs` | `DOORS_CLOSE_YMD = "2026-08-27"`, last sales `2026-08-26` |
| `src/content/emailCatalog.js` | Admin mirror of the same bodies |
| `src/views/SignInPage.jsx` | Hardcoded “starts Monday, Aug 31” (does **not** read `CONFIG`) |
| `src/views/JoinPage.jsx` | Reads `CONFIG.COHORT_START*` |
| `src/lib/cohorts.js` + `functions/_shared/cohorts.js` | `programStart: 2026-08-31` (product calendar, not marketing) |
| `supabase/functions/finish-joining/index.ts` | Duplicate constants `Aug 27` / `Aug 31` (legacy Edge Function) |

`marketing/CURSOR-INSTRUCTIONS.md` already says dates should be one-line edits in `config.ts`. They are not — emails and SignIn still duplicate.

### 25. Is checkout gated on the deadline or the 50-cap?

**Copy only.** `POST /api/checkout` does **not** read Aug 27, does **not** count paid seats, and does **not** call `enrollmentIsOpen()`. It blocks refunded / already-paid / missing Stripe price id. That is it.

`ENROLLMENT_OPEN` is a **client + drip** switch (`src/config.js` `true`; Cloudflare env for cron). `App.jsx` can send people to the waitlist when false. `email-cron` stops Track B nudges when closed except founding finish-pay. `functions/_shared/pricing.js` defines `enrollmentIsOpen()` but checkout never uses it.

**If we removed all date *copy*:** homepage, quiz, `/signin`, `/join`, and leftover drips stop lying. Stripe stays open. JSON-LD `LimitedAvailability` stays (not date-based).

**If we removed all date *logic*:**

- `COHORT_CALENDAR.programStart/End` — week numbers, membership / alumni gate, voice-drop week labels, Today/Progress “Week X”.
- `ENROLLMENT_CLOSED_AT` — who still gets founding $149.
- `cohortEmailWindow` — last unpaid sales mail (already past as of 30 Aug 2026).
- Tests locked to Aug 26/27/31.

Do not delete the product calendar to clean the homepage.

### 26. $249 early vs $299 full

**Separate Stripe Price IDs**, resolved server-side in `functions/_shared/pricing.js` → `resolveCheckoutOffer`:

1. Account created before `ENROLLMENT_CLOSED_AT` (default `2026-07-26T02:00:00.000Z`) → founding **$149** (`STRIPE_PRICE_ID_FOUNDING`).
2. Email has a `marketing_leads` row with segment `main` or `early_pp_nurture` → early **$249** (`STRIPE_PRICE_ID_WAITLIST` / `PRICE_QUIZ_RATE`).
3. `OPEN_WITHOUT_QUIZ=true` → everyone $249.
4. Else → full **$299** (`STRIPE_PRICE_ID_FULL` / `PRICE_FULL_RATE`).

Not a coupon (referral $25 is a separate promo on the $249 tier only). Not a flag on `profiles`. Live lookup of `marketing_leads.email` + `segment`. Pregnancy / plant-based do not unlock $249. `needs_review` still unlocks.

**Evergreen with no dates:** keep steps 2 and 4. Drop or freeze the founding cutoff once those accounts are gone. Stop putting Aug 27/31 in copy. Quiz unlock already works without a calendar. Homepage can keep showing $299; quiz still reveals $249.

### 27. Quiz flow, results, confirmation — dates?

**Yes on results. No on waitlist thanks. No on intake.**

- **Quiz questions:** no dates.
- **Results** (`marketing/public/quiz-app.js` `renderResult`): fast-lane “{Aug 31} group” + “Doors close Aug 27”; offer title **“Ready to lock your Aug 31 spot?”**; lede with doors-close + start + “capped at 50 mamas”; sticky “Doors close Aug 27”. Pregnancy nurture skips this block.
- **`/thanks`** (`thanks.astro`): waitlist confirmation — no Aug dates.
- **Stripe success → intake** (`IntakeFlow.jsx`): no Aug 27/31.
- **`/signin` and `/join`:** yes (see §24). Those are the post-quiz confirmation / lock screens.

### 28. Stale deadline copy in drips / Resend

Drips are **hourly cron** (`POST /api/email-cron`), not Resend scheduled sends. Resend check (30 Aug 2026): **0 automations**, **1 broadcast** (Day 1 WhatsApp + orientation, already `sent` 27 Jul 2026). Nothing queued in Resend will fire Aug 31 copy.

**Live templates that still mention the dates** (will send to leftover leads who quiz or create an account now):

| Template | Dates in body | Still sends after Aug 27? |
|---|---|---|
| `quiz_ranges` | “The group starts Monday, Aug 31.” No Aug 27. | **Yes** — immediate on quiz submit |
| `quiz_drip_2d` | “This group starts Monday, Aug 31.” | **Yes** — +2 days, no doors-close stop |
| `quiz_drip_7d` | “The group starts Monday, Aug 31.” Trigger text mentions Aug 27. | **No** — `isOnOrAfterDoorsClosePt` |
| `quiz_pregnancy_note` | none | Yes (nurture only) |
| `finish_joining_1h` | “We start Aug 31. Doors close Aug 27.” | **Yes** — +1h |
| `finish_joining_24h` | same | **Yes** — +24h |
| `finish_joining_close` | “Doors close Aug 27. We start Monday.” | **No** — last-sales-day only |
| `welcome` / intake / `macros_live` | no Aug 27/31 | Yes |
| `quiz_one_more` | “registration will close tonight” (manual blast) | Only if Callie sends it |

`src/content/emailCatalog.js` is the admin mirror — change senders in `marketing/src/lib/*Email.mjs` and the catalog together.

**Stale-copy risk right now:** leftover who take the quiz after doors-close still get `quiz_ranges` + `quiz_drip_2d` saying the group starts Aug 31. Unpaid accounts still get finish-joining +1h/+24h with “Doors close Aug 27.”

### 29. What “group starts Aug 31” actually triggers

**No midnight cron on Aug 31.** It is the Monday of Week 1 on `COHORT_CALENDAR` for `2026-08`.

Derived from that timestamp:

- `programWeekNumber` / Today + Progress + admin “Week X of 8”
- Membership / alumni gate (`programEnd` 2026-10-26)
- Monday voice-drop **week labels** (Callie still publishes by hand; the drop is not auto-created on Aug 31)
- Pricing window / `cohortForDate` when stamping `cohort_label` at pay

**Not triggered by Aug 31:**

- **Content unlock** — paid + Callie approved (`macros.approved` + `profiles.status='active'`). A mama approved on Aug 20 can log immediately.
- **Group thread** — `handlePaidEnrollmentChannel` at Stripe pay (joins pre-seeded `conversations.cohort_label='2026-08'`). Approve runs `handleActivationCohort` again (idempotent).
- **Week-1 voice note** — Callie records and publishes via `POST /api/admin-voice-drop`. No auto-fire.

**Ranges-approved is already an event.** `POST /api/macros-approved` (Callie taps Approve):

1. `macros.approved = true`
2. `profiles.status = 'active'`, `week = 1`
3. `handleActivationCohort` (stamp cohort if missing + channel membership)
4. `macros_live` email (“Your ranges are ready”)

In a rolling model, fire “your week 1 starts now” (voice drop targeting, week labels, welcome-to-group) **on that approve**, not on a shared Aug 31. The missing piece is a per-person `program_start`, not a new event bus.

### 30. Lab Review “limited spots per group”

**Copy only.** Checkout adds `STRIPE_PRICE_ID_LAB_ADDON` ($349) when the `/join` checkbox is on. Webhook sets `lab_review_purchased`. No inventory, no per-cohort counter, no disable-at-N.

Copy: Pricing kicker “limited spots per group”; FAQ “spots are limited to protect Callie’s review time.” `/join` checkbox has **no** scarcity line (educational analysis only).

**Evergreen:** drop “per group” / “limited spots.” Keep “Callie reviews these herself, so she takes them one at a time” (or just the educational disclaimer). Enforcement is Callie saying no, not Stripe.

### 31. Is the 50-cap checked in code?

**No.** `marketing/src/config.ts` says it outright: “soft cap in copy only; no counters or remaining-spot math.”

No `COUNT(*)` of paid profiles before signup, checkout, or quiz submit. Paid + comps already exceed a literal 50 if you count Founding + August together. Homepage, quiz offer, sticky bar, FAQ, and Pricing are marketing only.

---

## Recommendation

Keep derivation; add a **read model** (person key = `lower(email)`, plus `profile_id` when present) that exposes leftover, roster stage, last email, last admin DM, unread, next drip. Add a stored status only if Callie needs overrides. The 48 paid-without-quiz people are the first hole a unified Contacts list will hit.

For a per-client AI summary: new Pages Function on the OpenRouter helper, generate-on-open with a new 24h cache table, reuse `loadClientProgress` + last N DMs, share `buildHabitRhythm` for flag chips, and do not send group-chat bodies until privacy copy is updated.

For evergreen enrollment: Stripe is already date-agnostic. The work is deleting Aug 27/31 / “capped at 50” from marketing + quiz + `/signin` + `/join` + leftover drip templates (`quiz_ranges`, `quiz_drip_2d`, `finish_joining_1h` / `_24h`), and leaving `COHORT_CALENDAR` alone until rolling starts exist.
