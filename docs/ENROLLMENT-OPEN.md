# Enrollment & pricing

## How checkout price is chosen

`functions/_shared/pricing.js` → `resolveCheckoutOffer`:

1. **Founding finish** — account `created_at` before `ENROLLMENT_CLOSED_AT` → **$149**
2. **Quiz lead** — email has an eligible row on `marketing_leads` (`main` or `early_pp_nurture`) → **$249**
3. **`OPEN_WITHOUT_QUIZ=true`** — anyone signed in can pay **$249** (recommended while pre-selling the next cohort)
4. Else → **403 `quiz_required`**

Payment is always for the **next named cohort** (start date in copy). It does not start coaching the day they pay — Callie still runs intake → approve before day one.

## Recommended Cloudflare (SPA `macros-and-mamas` Production)

```
ENROLLMENT_OPEN=true
OPEN_WITHOUT_QUIZ=true
STRIPE_PRICE_ID_WAITLIST=<your $249 price id>
STRIPE_PRICE_ID_LAB_ADDON=price_1U1vfzRyN0PahoiM6AVgkMYh
SUPABASE_SERVICE_ROLE_KEY=…
```

| Var | Role |
| --- | --- |
| `ENROLLMENT_OPEN=true` | Client allows create-account + `/join` |
| `OPEN_WITHOUT_QUIZ=true` | Server lets `/join` charge $249 without a quiz lead |
| Quiz | Still the best marketing path (ranges preview); not a pay wall |

## Always set a next cohort start date

Edit both (keep in sync):

- `marketing/src/config.ts` — `cohortStartDate`, `cohortStartDateShort`, `cohortStartDateCompact`, `doorsCloseDate`
- `src/config.js` — `COHORT_LABEL`, `COHORT_START`, `COHORT_START_SHORT`, `COHORT_START_COMPACT`

Never sell seats without an expected start date on the page.

## Marketing mode

`marketing/wrangler.toml` → `PUBLIC_ENROLLMENT_MODE = "waitlist"`:

- Homepage still teases the quiz (ranges + early-rate story)
- With `OPEN_WITHOUT_QUIZ=true`, someone who skips the quiz can still create an account and pay on `/join`

## Later

When you want $299 for new joins, change the open tier in `resolveCheckoutOffer` to `full` and set marketing `openPrice = fullPrice`.
