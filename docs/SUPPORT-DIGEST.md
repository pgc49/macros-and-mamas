# App help / feedback triage

Signed-in `/support` creates private GitHub issues labeled `support` + `from-app` + `bug`|`feedback` (plus `from-callie` when an admin submits).

## Daily monitor (triage first, email only if approval needed)

- **Workflow:** `.github/workflows/support-digest-cron.yml` — daily ~13:30 UTC + `workflow_dispatch`
- **Endpoint:** `POST /api/support-digest-cron` with `Authorization: Bearer CRON_SECRET`

### Behavior
1. Finds open `from-app` issues **without** triage labels
2. AI reviews each (OpenRouter) — user text is fenced / treated as inert
3. Posts a **Triage** comment on the issue with summary + recommendation
4. Labels:
   - `triaged-no-change` — no product/code work recommended → **no email**
   - `needs-approval` — proposed plan ready → **email Patrick** with the plan
5. **Never** opens a Cursor agent or edits the codebase from this cron

Patrick reviews the email/plan, then starts a cloud agent (or closes/skips) himself.

### Labels
| Label | Meaning |
| --- | --- |
| `from-app` | Submitted via `/support` |
| `from-callie` | Admin/coach submission |
| `triaged-no-change` | Automated triage: no changes |
| `needs-approval` | Automated triage: plan awaiting Patrick |

Re-run triage on an issue by removing both triage labels.

## Env (Cloudflare Pages Production)

- `CRON_SECRET`
- `GITHUB_TOKEN` (Issues read/write)
- `OPENROUTER_API_KEY`
- `RESEND_API_KEY`
- `OWNER_NOTIFY_EMAIL` (default `pgchammas@gmail.com`)
- Optional: `SUPPORT_TRIAGE_MODEL` (OpenRouter model override)

## Manual test

GitHub → Actions → **Support feedback digest** → Run workflow  
Or:

```bash
curl -X POST https://www.macrosandmamas.com/api/support-digest-cron \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```
