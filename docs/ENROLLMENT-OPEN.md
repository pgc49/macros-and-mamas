# Enrollment open (early $249)

## Code
- `src/config.js` → `ENROLLMENT_OPEN: true`
- Checkout resolves to **waitlist / early rate $249** (`STRIPE_PRICE_ID_WAITLIST`)
- `/join` shows Lab Review add-on toggle (+$299)

## Cloudflare Pages (SPA `macros-and-mamas`) — required

Set on **Preview and Production**:

```
ENROLLMENT_OPEN=true
```

Already needed:

```
STRIPE_PRICE_ID_WAITLIST=<your $249 price id>
STRIPE_PRICE_ID_LAB_ADDON=price_1U0uX1RyN0PahoiMMckCnYMR
```

Without `ENROLLMENT_OPEN=true` on Cloudflare, `/api/checkout` still returns closed even if the client UI is open.

## Later
When you want $299 for new joins, change `resolveCheckoutOffer` open branch to `full` and set marketing `openPrice = fullPrice`.
