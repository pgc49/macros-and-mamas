# Stage 0 — Stripe foundation (housekeeping + webhook)

Read the build-plan README first. This stage is plumbing only — no referrals, ledger, channels, or subscription UX.

## Stripe objects (live account Macros & Mamas)

| Env / alias | Amount | Stripe id | Notes |
| --- | --- | --- | --- |
| `STRIPE_PRICE_ID_WAITLIST` / `PRICE_QUIZ_RATE` | $249 one-time | `price_1TxVoxRyN0PahoiMt0FVMFWg` | Quiz / early rate |
| `STRIPE_PRICE_ID_FULL` / `PRICE_FULL_RATE` | $299 one-time | `price_1TxVrJRyN0PahoiMLxAiTA68` | Full rate |
| `STRIPE_PRICE_ID_FOUNDING` | $149 one-time | `price_1Tv5aDRyN0PahoiM7eTlp4QP` | Pre-close accounts |
| `STRIPE_PRICE_ID_LAB_ADDON` / `PRICE_LAB_REVIEW` | $349 one-time | `price_1U1vfzRyN0PahoiM6AVgkMYh` | Lab Review add-on |
| `PRICE_ALUMNI_49` | $49/mo | `price_1U2OhjRyN0PahoiMS8gJvGXQ` | Product `prod_V2TfZU2hRakGgW` — Alumni Membership |
| `COUPON_REFERRAL_25` | $25 once | `REFERRAL_25` | Promotion codes created in stage 2 |

### Recurring-price audit

- Active recurring: only `price_1U2OhjRyN0PahoiMS8gJvGXQ` ($49/mo).
- Archived (not deleted): `price_1Tvmw3RyN0PahoiM9sj4jyp8` ($20/mo on product `prod_UveEN7pJh64W0W` “Macros & Mamas Monthly”). Product `default_price` cleared first, then price set `active: false`.
- No $59 price created (future work).

### Saved-card audit (for stage 4 UX)

**Answer: past program checkouts did NOT save cards for reuse.**

Evidence:

- `/api/checkout` never set `setup_future_usage` (or Checkout `saved_payment_method_options`).
- Live Checkout sessions use `customer_creation: if_required` historically; many completed sessions have `customer: null`.
- Sample paid PaymentIntent `pi_3TxYf5RyN0PahoiM1rgfKcu6`: `setup_future_usage: null`, `customer: null`.

Stage 0 change going forward: Checkout sets `customer_creation=always` so `profiles.stripe_customer_id` is populated for the Customer Portal. Still **no** `setup_future_usage` — stage 4 must use Checkout/SetupIntent for one-tap opt-in, not assume a saved card.

## Customer Portal

App wiring (already present, stage 0 tightened):

- `POST /api/billing` with `{ action: "portal" }` → Stripe Billing Portal session.
- Payments page **Open billing portal** button calls it.
- Optional env `STRIPE_BILLING_PORTAL_CONFIGURATION=bpc_…` pins a configuration.

**Patrick — Dashboard step (required for acceptance):** Stripe MCP cannot create portal configurations (API create not exposed). In Stripe Dashboard → Settings → Billing → Customer portal:

1. Enable: **Payment method update**, **Invoice history**.
2. Disable: **Cancel subscriptions**, **Update subscriptions** / plan switching.
3. If you create a named configuration, copy `bpc_…` into Cloudflare as `STRIPE_BILLING_PORTAL_CONFIGURATION` (Preview + Production).

Verify: portal opens from Payments; card can be updated; **no cancel** option.

## Webhook foundation

Endpoint: `/api/stripe-webhook`

1. Verify `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`.
2. Insert into `stripe_events (event_id pk, type, processed_at)`. On unique conflict → `200` + skip.
3. Route by type. Stage 0 implements `checkout.session.completed` (mark paid + welcome/CAPI). Other subscribed types log as unhandled shell.
4. If a handler throws after claim, the row is deleted so Stripe retries can re-run.

Subscribe these events (Dashboard webhook + Stripe CLI locally):

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.deleted`

Migration: `supabase/migrations/042_stripe_events.sql` (RLS on; admin select via `is_admin()`; service role writes).

### Idempotency smoke test (Patrick)

```bash
stripe listen --forward-to localhost:8788/api/stripe-webhook
stripe trigger checkout.session.completed
# Resend the same event from Dashboard or CLI — second delivery should return duplicate:true and not double-write paid.
```

## RLS baseline (later stages)

Confirmed: `public.is_admin()` = `profiles.role = 'admin'` for `auth.uid()`. Pattern for new tables:

- Owner: `user_id = auth.uid()` (or `profile_id`)
- Admin: `public.is_admin()` for read-all (and write where needed)
- Webhook/service: service role bypasses RLS

`stripe_events` has no owner column → admin select only; members have no access.

## Cloudflare env to set / confirm

Keep existing `STRIPE_PRICE_ID_*`. Optionally also set aliases:

```
PRICE_QUIZ_RATE=price_1TxVoxRyN0PahoiMt0FVMFWg
PRICE_FULL_RATE=price_1TxVrJRyN0PahoiMLxAiTA68
PRICE_LAB_REVIEW=price_1U1vfzRyN0PahoiM6AVgkMYh
PRICE_ALUMNI_49=price_1U2OhjRyN0PahoiMS8gJvGXQ
COUPON_REFERRAL_25=REFERRAL_25
# after Dashboard portal config:
# STRIPE_BILLING_PORTAL_CONFIGURATION=bpc_...
```

## Acceptance checklist

- [x] Env docs hold `PRICE_QUIZ_RATE`, `PRICE_FULL_RATE`, `PRICE_ALUMNI_49`, `PRICE_LAB_REVIEW`, `COUPON_REFERRAL_25` (aliases + live ids recorded).
- [x] Recurring-price audit done; $20/mo archived; outcome noted above.
- [ ] Portal opens from Payments; card update works; **no cancel** (Patrick Dashboard config + smoke).
- [ ] Webhook verifies signatures; replaying the same test event twice processes once (Patrick Stripe CLI).
- [x] Saved-card question answered and recorded (no saved cards; stage 4 needs Checkout/Setup).

## Open items (README / Patrick)

1. **Credits vesting window:** site says no refunds; build plan uses 14-day vest — confirm `VESTING_DAYS` before stage 1.
2. **Customer Portal Dashboard config** (cancel off) — MCP could not create `bpc_…`.
3. **Legacy checkouts** may lack `stripe_customer_id` until they re-checkout or we backfill Customers — portal stays disabled for those rows.
4. **Payments week math bug** (Week 1 vs Week 3) — fix by stage 4; not this stage.
