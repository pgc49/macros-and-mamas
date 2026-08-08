# Enrollment & pricing (Strategy A)

## How checkout price is chosen

`functions/_shared/pricing.js` → `resolveCheckoutOffer`:

1. **Founding finish** — account `created_at` before `ENROLLMENT_CLOSED_AT` → **$149**
2. **Quiz lead** — email has an eligible row on `marketing_leads` (`main` or `early_pp_nurture`) → **$249**
3. **`OPEN_WITHOUT_QUIZ=true`** — anyone signed in can pay **$249** (off for Strategy A)
4. Else → **403 `quiz_required`**

Payment is always for the **next named cohort** (start date in copy). Intake → Callie approve still happens before day one.

## Strategy A (current — paid traffic)

- Homepage / public: show **full rate $299**
- After eligible quiz: reveal **early $249** and unlock checkout
- Cloudflare: **`OPEN_WITHOUT_QUIZ` unset or `false`**
- Meta **Lead** fires only for enrollable segments (`main`, `early_pp_nurture`) — not pregnant / vegan nurture
- Cold ads → `/quiz` (optionally `?q1=…` per season); homepage for organic / retargeting

## Recommended Cloudflare (SPA `macros-and-mamas` Production)

```
ENROLLMENT_OPEN=true
OPEN_WITHOUT_QUIZ=false
STRIPE_PRICE_ID_WAITLIST=<your $249 price id>
STRIPE_PRICE_ID_FULL=<your $299 price id>
STRIPE_PRICE_ID_LAB_ADDON=price_1U1vfzRyN0PahoiM6AVgkMYh
SUPABASE_SERVICE_ROLE_KEY=…
```

| Var | Role |
| --- | --- |
| `ENROLLMENT_OPEN=true` | Client allows create-account + `/join` |
| `OPEN_WITHOUT_QUIZ=false` | Server requires quiz lead for $249 |
| Quiz | Lead magnet + price unlock |

## Always set a next cohort start date

Edit both (keep in sync):

- `marketing/src/config.ts` — `cohortStartDate`, `doorsCloseDate`, prices
- `src/config.js` — `COHORT_LABEL`, `COHORT_START`, …

Never sell seats without an expected start date + doors-close date on the page.

## Marketing mode

`marketing/wrangler.toml` → `PUBLIC_ENROLLMENT_MODE = "waitlist"`:

- Homepage lists **$299** and pushes the quiz to unlock **$249**
- Post-quiz offer shows early rate + pre-pay CTA

## Later

When you want $299 for new joins with no early rate, retire the quiz unlock path and set marketing `openPrice = fullPrice` with mode `open`.
