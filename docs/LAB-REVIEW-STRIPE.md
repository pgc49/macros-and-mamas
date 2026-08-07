# The Lab Review — Stripe + DB

## Stripe (live)

| | |
| --- | --- |
| Product | `prod_V0wP87f6etTxHb` — **The Lab Review** |
| Price | `price_1U0uX1RyN0PahoiMMckCnYMR` — **$299** one-time |
| Metadata | `sku=lab_review` |

## Cloudflare Pages (SPA project `macros-and-mamas`)

Add **runtime** secret / variable:

```
STRIPE_PRICE_ID_LAB_ADDON=price_1U0uX1RyN0PahoiMMckCnYMR
```

Without this, checkout with the Lab Review toggle returns `lab add-on unavailable`.

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
