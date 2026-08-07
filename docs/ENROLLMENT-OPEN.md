# Enrollment & quiz-unlock pricing

## How checkout price is chosen

`functions/_shared/pricing.js` → `resolveCheckoutOffer`:

1. **Founding finish** — account `created_at` before `ENROLLMENT_CLOSED_AT` → **$149**
2. **Quiz unlock** — email has an eligible row on `marketing_leads` (`main` or `early_pp_nurture`) → **$249** (`STRIPE_PRICE_ID_WAITLIST`)
3. Else → **403 `quiz_required`**

Optional escape hatch: set Cloudflare `OPEN_WITHOUT_QUIZ=true` to sell $249 without a quiz lead.

## Marketing (waitlist mode)

`marketing/wrangler.toml` → `PUBLIC_ENROLLMENT_MODE = "waitlist"`:

- Homepage CTAs push the **quiz** (“unlock $249”)
- Post-quiz payoff shows app-style ranges + **Pre-pay $249 — lock my spot**
- Pregnant / vegan finishes stay nurture-only (no pay offer)

## Cloudflare Pages (SPA `macros-and-mamas`)

Required Price IDs:

```
STRIPE_PRICE_ID_WAITLIST=<your $249 price id>
STRIPE_PRICE_ID_LAB_ADDON=price_…
SUPABASE_SERVICE_ROLE_KEY=…   # needed to look up marketing_leads
```

`ENROLLMENT_OPEN=true` on the client still allows create-account + `/join` routing. It does **not** by itself unlock $249 anymore — the quiz lead does.

## Later

When you want $299 for new joins, change the quiz-unlock / open tier in `resolveCheckoutOffer` to `full` and set marketing `openPrice = fullPrice`.
