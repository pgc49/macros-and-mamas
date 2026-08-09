# Stage 2 — Security review (2026-08-09)

Scope: `referral_codes`, `referrals`, Share / admin referral APIs, checkout promo path, webhook attribution, `profiles.ambassador` / `cohort_label`.

## Verdict

**One medium client-writable privilege flag** found and fixed (`ambassador` / `cohort_label`). Remaining money movement stays gated by admin JWT, verified Stripe webhooks, or paid-client Share (own data only).

## Trust boundaries

| Surface | Auth | Risk if broken |
| --- | --- | --- |
| `GET /api/referrals` | JWT + paid (or admin) | Create own code; read own tally |
| `GET/POST /api/admin-referrals` | JWT + `role=admin` | Backfill / inspect any mama |
| `POST /api/checkout` + `referral_code` | JWT; waitlist tier only | $25 off + attribution metadata |
| Stripe webhook referral handlers | HMAC + `stripe_events` | Grant/reverse referral credits; set ambassador |
| Supabase client → referral tables | SELECT own/admin; **no** write policies; writes revoked | Direct client forge blocked |

## Findings

### Fixed / hardened now
1. **`profiles.ambassador` / `cohort_label` client-writable (medium)** — update/insert triggers did not lock the new columns. Client could `PATCH` `ambassador=true`. Migration `046_protect_ambassador.sql` freezes both for non-admin / non-service_role.
2. **Admin GET side-effect (low)** — `GET /api/admin-referrals` called `ensureReferralCode` (created Stripe promos). Now read-only; create via `POST` `ensure` / `backfill` / mama Share only.
3. **PII in Share payload (low)** — client Share response no longer includes `referred_email` rows; admin inspect can still request details.
4. **Error message leakage (low)** — referral APIs return generic 500 bodies (no Supabase/Stripe internals).
5. **Admin `userId` validation (low)** — UUID check on admin get/ensure.
6. **Notify header injection (low)** — ambassador email subject/body strips CR/LF from name/email.
7. **Webhook self-referral by email** — skip credit when checkout email matches advocate email (in addition to user id).

### Accepted residual
- **Sockpuppet referrals** (second email/account) — inherent to code-based programs; no automated KYC.
- **`allow_promotion_codes` on empty Join field** — Stripe may accept other eligible promos on the account; keep non-referral coupons archived. Credit only if promo id is in `referral_codes`.
- Compromised **admin session** can backfill / ensure codes (by design).
- Compromised **`STRIPE_WEBHOOK_SECRET`** can forge attribution (pre-existing class).

## What attackers cannot do (with current code)
- Mama A cannot read Mama B’s referral rows or codes via Supabase RLS.
- Non-admin cannot call backfill / ensure / admin inspect.
- Clients cannot INSERT/UPDATE `referral_codes` or `referrals`.
- Clients cannot self-set `ambassador` or `cohort_label`.
- Unpaid clients cannot mint a Share code via `/api/referrals`.
- Webhook replay cannot double-grant the same referral credit (session unique + ledger unique on `related_referral_id`).
