# The Lab Review — Stripe + DB

## Stripe (live)

| | |
| --- | --- |
| Product | `prod_V0wP87f6etTxHb` — **The Lab Review** |
| Price (current) | `price_1U1vfzRyN0PahoiM6AVgkMYh` — **$349** one-time |
| Lookup key | `lab_review_addon_349` |
| Metadata | `sku=lab_review` |
| Prior price | `price_1U0uX1RyN0PahoiMMckCnYMR` — $299 (retired; do not use for new checkouts) |

## Cloudflare Pages (SPA project `macros-and-mamas`)

Set **runtime** variable on Preview + Production:

```
STRIPE_PRICE_ID_LAB_ADDON=price_1U1vfzRyN0PahoiM6AVgkMYh
```

Without this (or if the old $299 id is left in place), display says $349 but Stripe may charge the wrong Price ID — keep them matched.

## Database

Migration `037_lab_review_addon` (applied):

- `profiles.lab_review_purchased` (bool, default false)
- `profiles.lab_review_purchased_at` (timestamptz)
- Client updates blocked via payment privilege triggers

Webhook sets both when Checkout metadata `lab_review=true`.

## Flow

1. `/join` optional checkbox → `lab_review: true` to `/api/checkout`
2. Stripe session gets second line item (lab price)
3. `checkout.session.completed` → `paid` + `lab_review_purchased`

## Not built yet

- $200 Callie-ordered blood panel as its own Stripe product/checkout
- Mid-cohort “add Lab Review later” purchase path
- Admin roster column for `lab_review_purchased` (queryable in Supabase now)
