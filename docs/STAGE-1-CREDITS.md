# Stage 1 — Credit ledger + Credits UI

Requires stage 0. Referrals (stage 2) write `reason=referral` rows into this ledger.

## Review fixes (pre-ship)

- Invoice credit applied = `ending_balance - starting_balance` (credit balances are negative).
- Stripe Customer Balance posts use `Idempotency-Key` so cron/reverse retries cannot double-credit.
- `checkout.session.async_payment_succeeded` marks paid (Klarna/Affirm); skips welcome if already paid.
- Reverse of a mirrored credit fails closed if `stripe_customer_id` is missing (no ledger/Stripe drift).

## Adjustments vs the stage-1 brief

| Brief | What we did | Why |
| --- | --- | --- |
| Daily scheduled function | Hourly GitHub Action → `POST /api/credits-cron` (same `CRON_SECRET` as email-cron) | Repo has no Workers cron; hourly pattern already exists; finer than daily for vesting UX |
| `related_referral_id` uuid | Nullable **without FK** | `referrals` table does not exist until stage 2 |
| Status-only ledger | Added `mirrored_at` + `stripe_balance_transaction_id` | Idempotent Stripe Customer Balance sync; retry when `stripe_customer_id` missing |
| Balance formula alone | Redemption also inserts audit row (`reason=redemption`) and FIFO-marks grants | Matches brief; partials split remainder into a new `available` row |
| Lab Review via Invoice | Documented only — Checkout unchanged | Out of scope for stage 1; remember before Lab Review relies on credits |

## Data model

`credit_ledger` — see `supabase/migrations/043_credit_ledger.sql`.

- Available balance = `SUM(amount_cents) WHERE status = 'available'`.
- RLS: select own or admin; **no** client insert/update/delete.
- Writes: `/api/admin-credits`, `/api/credits-cron`, `invoice.paid` webhook handler.

## Stripe mirroring

- Only `status=available` rows with `mirrored_at IS NULL` and positive `amount_cents`.
- Post Customer Balance Transaction with **negative** `amount` (credit).
- Reversal of mirrored available → positive balance transaction (debit) + status `reversed`.
- Pending reverse → status only (never touches Stripe).
- **Discipline:** do not hand-edit customer balances in the Dashboard.

Customer Balance applies to **invoices**, not one-time Checkout. Membership invoices (stage 4) and future Lab Review-via-invoice will consume credits automatically; `invoice.paid` records redemptions.

## Env

```
VESTING_DAYS=3
CRON_SECRET=...   # already used by email-cron
```

## Admin

Admin → **Credits** tab (`?tab=credits`): search roster / load by email → grant (optional vest-now) / reverse.

## Client UI

Payments page Credits card between Monthly membership and Payment history. Hidden when the user has zero ledger rows.

## Acceptance (Patrick — test mode)

1. Admin grants $25 with “vest immediately” → trigger `credits-cron` (Actions workflow_dispatch or `curl`) → Stripe customer balance −$25.
2. Throwaway test subscription invoice consumes balance → ledger redemption row.
3. Reverse pending before vest → no Stripe movement.
4. Reverse available after mirror → Stripe debit posted.
5. Payments shows balance / pending / lines; hidden at zero rows.
6. RLS: user A cannot read B; client cannot insert.

Vesting default is **3 days** after the payment that earns the credit (not tied to macros approval). Pending credits already show on Payments for Mama A.
