# Stage 2 — Referral codes + attribution + Share

Requires stages 0–1. Advocates get a personal code; friends save $25 on the quiz rate; advocate earns a $25 pending credit (vests per `VESTING_DAYS`).

Security review: `docs/STAGE-2-SECURITY-REVIEW.md`.

## Adjustments vs the stage-2 brief

| Brief | What we did | Why |
| --- | --- | --- |
| `profiles.ambassador` in stage 3 | Added in stage 2 with `cohort_label` | Milestone fires on 3rd paid referral here |
| Promo on any checkout | **Quiz / early `$249` (waitlist) only** | Founding/full are separate rates; avoid stacking |
| `allow_promotion_codes` always | Field on Join **or** hosted promo entry — never both on one session | Stripe forbids `discounts` + `allow_promotion_codes` together |
| Code collisions `SARAH25B` | `SARAH25` → `SARAHJ25` (last initial) → `SARAH252`… | Readable for two Sarahs; numbers only as fallback |
| Edge notify for ambassador | Resend from Pages using `CALLIE_NOTIFY_EMAIL` | Avoid depending on edge redeploy |
| Backfill “Cohort 1” | Active paid clients (`role=client`, `paid`, not refunded, `status=active`) | Matches who should advocate now |

## Data model

See `supabase/migrations/045_referrals.sql`.

- `referral_codes` — one active code per advocate + Stripe promotion code id on `COUPON_REFERRAL_25`
- `referrals` — attribution per checkout session; links `credit_ledger_id` when paid
- `marketing_leads.referred_by` — optional quiz text; **manual recon only** (no auto credit)
- RLS: select own or admin; writes service-role only (`FORCE ROW LEVEL SECURITY`)

## Flows

1. **Lazy code** — first visit to Account → Share → `GET /api/referrals` creates code + Stripe promo.
   Collision order: `SARAH25` → `SARAHJ25` (last-name initial) → `SARAH252`, `SARAH253`…
2. **Backfill** — Admin → Credits → “Backfill referral codes” → `POST /api/admin-referrals` `{ action: "backfill" }`.
3. **Checkout** — Join (early rate) optional code → `discounts[0][promotion_code]`; if blank, `allow_promotion_codes=true`. Self-referral blocked.
4. **Webhook** — `checkout.session.completed` / `async_payment_succeeded` → referral row + pending credit; `charge.refunded` → referral `refunded` + reverse credit; 3rd paid → `profiles.ambassador=true` + email Callie.

## Env

```
COUPON_REFERRAL_25=REFERRAL_25
REFERRAL_COHORT_LABEL=2026-08   # optional; default 2026-08
VESTING_DAYS=3                  # already set in stage 1
CALLIE_NOTIFY_EMAIL=...         # ambassador notify (with RESEND_API_KEY)
```

## Acceptance

- [ ] Backfill creates codes + Stripe promos for active paid clients
- [ ] Checkout with code → ~$224 on quiz rate; referral `paid`; ledger +$25 pending; Share tally updates
- [ ] Webhook replay → no duplicate credit (session unique + ledger unique on `related_referral_id`)
- [ ] Self-referral blocked
- [ ] Refund → referral `refunded`, credit reversed
- [ ] 3rd paid referral → `ambassador=true` + admin email
- [ ] Quiz “who sent you” stores on `marketing_leads.referred_by`
