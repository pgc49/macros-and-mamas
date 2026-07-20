# Lifecycle emails (Supabase Edge Functions + Resend)

Resend sends from **Callie · Macros and Mamas** `<calista@nourishwithcalista.com>`.
`RESEND_API_KEY` lives in Supabase Edge Function secrets (already set).

Stripe keys stay on **Cloudflare** — do not add them here.

## Functions

| Slug | Email | Trigger |
|------|--------|---------|
| `welcome-email` | #2 Welcome | Cloudflare `stripe-webhook` after paid |
| `intake-received` | #4 Intake received | Cloudflare `/api/intake-submitted` |
| `application-approved` | #5 Macros live | Cloudflare `/api/macros-approved` |
| `eligibility-refund` | #6 Refund confirm | Cloudflare `/api/refund` |
| `notify-callie` | Callie A/B/C | Same handlers as above |

Scheduled emails (#1, #3, #7, #8, Callie D) are not wired yet.

## Deploy (from repo root on your Mac)

```bash
cd /Users/patricksmacmini/macros-and-mamas
git pull origin main

supabase secrets set APP_URL=https://www.macrosandmamas.com
supabase secrets set CALLIE_NOTIFY_EMAIL=calista@nourishwithcalista.com
# RESEND_API_KEY should already exist — confirm with: supabase secrets list

supabase functions deploy welcome-email --project-ref reangkqbsazwxvrqvsdo
supabase functions deploy application-approved --project-ref reangkqbsazwxvrqvsdo
supabase functions deploy intake-received --project-ref reangkqbsazwxvrqvsdo
supabase functions deploy eligibility-refund --project-ref reangkqbsazwxvrqvsdo
supabase functions deploy notify-callie --project-ref reangkqbsazwxvrqvsdo
```

Cloudflare already has `SUPABASE_SERVICE_ROLE_KEY` for the webhook; that same key invokes these functions.
