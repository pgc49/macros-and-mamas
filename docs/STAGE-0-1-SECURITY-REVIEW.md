# Stage 0 / 1 — Security review (2026-08-09)

Scope: Stripe webhook foundation, Customer Portal wiring, `credit_ledger`, admin credits, credits cron, billing credits payload.

## Verdict

**No critical/high client-exploitable issues** found. Money movement is gated by admin JWT + `profiles.role = 'admin'`, cron secret, or verified Stripe webhooks. Clients cannot insert/update ledger rows.

Hardening applied in this pass: revoke client write GRANTs + FORCE RLS; cap manual grants; validate UUIDs / note length.

## Trust boundaries (pass)

| Surface | Auth | Risk if broken |
| --- | --- | --- |
| `POST /api/stripe-webhook` | HMAC `Stripe-Signature` + 5m skew + `stripe_events` claim | Mark paid / redeem credits |
| `POST /api/credits-cron` | `Bearer CRON_SECRET` (timing-safe) | Vest + mirror existing rows only (cannot invent grants) |
| `GET/POST /api/admin-credits` | Supabase JWT + `role=admin` | Grant/reverse any mama’s credits |
| `GET /api/billing` credits | JWT; ledger filtered to `user.id` | Read own credits only |
| Supabase client → `credit_ledger` | RLS select own/admin; **no** write policies; writes revoked | Direct client grant blocked |

## Findings

### Fixed / hardened now
1. **Table GRANTs too wide (medium → mitigated)** — `anon`/`authenticated` had INSERT/UPDATE/DELETE/TRUNCATE on `credit_ledger` and `stripe_events` (Supabase default). RLS blocked writes, but privilege was excess. Migration `044_credit_ledger_grants`: revoke writes; SELECT for `authenticated` only; `FORCE ROW LEVEL SECURITY`.
2. **Admin grant unbounded (low, admin-trust)** — capped manual grants at **$500** (`MAX_MANUAL_GRANT_CENTS`).
3. **Input validation (low)** — UUID checks on `userId` / `ledgerId` / `related_referral_id`; notes truncated to 500 chars.

### Accepted (not bugs for this threat model)
- Compromised **admin session** can grant/reverse credits (by design; same as other admin APIs).
- Compromised **`CRON_SECRET`** can vest/mirror pending rows (cannot create new grant amounts).
- Compromised **`STRIPE_WEBHOOK_SECRET`** can forge events (pre-existing class; secret must stay server-only).
- Manual Stripe Dashboard balance edits can desync ledger (documented discipline).
- Admin reverse by `ledgerId` alone (admin can act on any row — intended).

### Residual recommendations (optional, later)
- Unique partial index on `profiles.stripe_customer_id` where not null.
- Audit columns: `created_by_admin_id` on manual grants/reversals.
- DB-first “mirror_pending” state before Stripe POST (narrower crash window).

## What attackers cannot do (with current code)
- Mama A cannot read Mama B’s ledger via `/api/billing` or Supabase select of B’s rows.
- Non-admin cannot call grant/reverse.
- Unauthenticated cannot trigger vest/mirror without `CRON_SECRET`.
- Clients cannot INSERT into `credit_ledger` / `stripe_events` (RLS + revoked GRANTs).
- Forged webhooks without valid signature are rejected.
