# App help / feedback digest

Signed-in `/support` creates private GitHub issues labeled `support` + `from-app` + `bug`|`feedback` (plus `from-callie` when an admin submits).

## Daily monitor (surface only)

- **Workflow:** `.github/workflows/support-digest-cron.yml` — daily ~13:30 UTC + `workflow_dispatch`
- **Endpoint:** `POST /api/support-digest-cron` with `Authorization: Bearer CRON_SECRET`
- **Behavior:**
  - Lists open `from-app` issues created in the last ~26h
  - If **none** → `{ skipped: "none_new" }`, no email
  - If **any** → emails `OWNER_NOTIFY_EMAIL` (Patrick) with titles + links
  - **Does not** open Cursor agents, comment, or close issues

Review the issue yourself, then start a cloud agent only when you want work done.

## Env (Cloudflare Pages Production)

Already used elsewhere:

- `CRON_SECRET`
- `GITHUB_TOKEN` (Issues read — digest; write — create from `/support`)
- `RESEND_API_KEY`
- `OWNER_NOTIFY_EMAIL` (default `pgchammas@gmail.com`)

Optional: `SUPPORT_DIGEST_LOOKBACK_HOURS` (default `26`).

## Manual test

GitHub → Actions → **Support feedback digest** → Run workflow  
Or:

```bash
curl -X POST https://www.macrosandmamas.com/api/support-digest-cron \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```
