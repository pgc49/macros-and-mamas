# Ranges quiz lead magnet

Marketing-only lead magnet (`/quiz`) using Callie's band math from the quiz source of truth.

## What shipped

| Piece | Location |
| --- | --- |
| Engine + unit tests | `marketing/src/lib/rangesEngine.mjs` (`npm test` in `marketing/`) |
| Lead table | `supabase/migrations/039_marketing_leads.sql` (service-role writes; RLS on, no anon policies) |
| API | `marketing/functions/api/lead.ts` — recompute, upsert, CAPI Lead (`content_name: ranges_quiz` only), Resend email |
| Quiz UI | `marketing/src/pages/quiz.astro` + `marketing/public/quiz-app.js` |
| Inline Q1 | `marketing/src/components/QuizInline.astro` (after ranges card) |
| Sample card | Driven by `sampleCardRanges()` (goal 150, exclusive) |
| CTAs | Waitlist mode: quiz primary; open mode: Join primary, quiz secondary |

## Env (marketing Pages)

| Var | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Upsert `marketing_leads` |
| `RESEND_API_KEY` | Delivery email |
| `LEAD_FROM_EMAIL` | Optional From (default Callie address) |
| `META_PIXEL_ID` / `META_CAPI_ACCESS_TOKEN` | Optional Lead CAPI |
| `PUBLIC_ENROLLMENT_MODE` | `waitlist` \| `open` — set in `marketing/wrangler.toml` `[vars]` (CTA prominence) |

## Modes

- **Waitlist:** hero / sticky / final / header → “See your ranges free”
- **Open:** Join now primary; quiz as secondary text link + inline embed

## Q1 flow

Six pills: Still pregnant · 0–3 months · 3–12 months · 1–2 years · 2+ years · Not postpartum.

- **Still pregnant** → nurture gate (no cut ranges; no product preview)
- **Not postpartum** → skip feeding; go straight to height/weight
- Other PP options → feeding question, then height/weight

Successful (non-pregnant / non-vegan) results show an **app-style product preview**: ranges card with band motif + interactive Log a meal carousel (Snap / Describe / My plan / Macros), plus an exclusive **pre-pay $249 / lock your spot** offer ($50 off full). Copy qualifies numbers as a preview — final ranges require Callie’s approval if they join.

Checkout enforces the unlock server-side: `/api/checkout` only returns the $249 tier when `marketing_leads` has an eligible row for that email (see `docs/ENROLLMENT-OPEN.md`).

No baby birthday and no mama DOB on the free calculator — postpartum stage from Q1 is enough.

## Privacy / Meta

Never send feeding, postpartum months, or Q7 flags in Pixel/CAPI `custom_data`. Only `content_name: "ranges_quiz"`.

## App engine

Quiz math is the SoT (`marketing/src/lib/rangesEngine.mjs`). Intake and admin draft from the same `computeRangeBands()` via `src/engine/computeMacros.js` (lows stored; dashboard still draws +10g / +150 cal). Do not silently recompute already-approved macros.

Nursing uses ×13 with **no** 1800 calorie floor. Non-nursing still uses ×12 and a 1500 floor.
