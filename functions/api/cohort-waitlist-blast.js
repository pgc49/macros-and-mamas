/* ==================================================================
   /functions/api/cohort-waitlist-blast.js — one-shot Resend blast
   ==================================================================
   Auth: Authorization: Bearer $CRON_SECRET

   Pulls unpaid, unconverted rows from public.cohort_waitlist and sends
   the cohort-open email (CTA → /signin → create account → pay).

   Body (JSON, optional):
     { "cohort": "cohort_2", "dryRun": true, "limit": 25 }

   Do NOT schedule this — invoke manually when enrollment opens:
     curl -X POST https://www.macrosandmamas.com/api/cohort-waitlist-blast \
       -H "Authorization: Bearer $CRON_SECRET" \
       -H "Content-Type: application/json" \
       -d '{"dryRun":true}'
   ================================================================== */

import { invokeEdgeFunction, logEmailEvent } from "../_shared/supabaseEmail.js";

const EMAIL_TYPE = "cohort_open";
const SUBJECT = "Spots are open. Lock in your spot";

export async function onRequestPost({ request, env }) {
  try {
    if (!authorize(request, env)) return json({ error: "unauthorized" }, 401);

    const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) return json({ error: "missing supabase config" }, 503);

    const body = await request.json().catch(() => ({}));
    const cohort = String(body.cohort || env.WAITLIST_COHORT || "cohort_2").slice(0, 40);
    const dryRun = body.dryRun === true;
    const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 2000);

    const rows = await fetchWaitlist(base, key, cohort, limit);
    const already = await fetchAlreadySent(base, key);

    const summary = {
      cohort,
      dryRun,
      candidates: rows.length,
      sent: 0,
      skipped: 0,
      errors: 0,
      samples: [],
    };

    for (const row of rows) {
      const email = String(row.email || "").trim().toLowerCase();
      if (!email) {
        summary.skipped += 1;
        continue;
      }
      if (already.has(email)) {
        summary.skipped += 1;
        continue;
      }
      if (row.paid_at || row.converted_at) {
        summary.skipped += 1;
        continue;
      }

      const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim()
        || row.first_name
        || "Mama";

      if (summary.samples.length < 5) {
        summary.samples.push({ email, name, id: row.id });
      }

      if (dryRun) {
        summary.sent += 1;
        continue;
      }

      const result = await invokeEdgeFunction(env, "cohort-open", { email, name });
      await logEmailEvent(env, {
        profileId: row.profile_id || null,
        emailType: EMAIL_TYPE,
        toEmail: email,
        subject: SUBJECT,
        resendId: result?.data?.data?.id || result?.data?.id || null,
        status: result.ok ? "sent" : "failed",
        meta: {
          slug: "cohort-open",
          cohort,
          cohort_waitlist_id: row.id,
        },
      });

      if (result.ok) {
        summary.sent += 1;
        already.add(email);
      } else {
        summary.errors += 1;
      }
    }

    return json(summary, 200);
  } catch (e) {
    console.error("cohort-waitlist-blast failed", e);
    return json({ error: "blast failed" }, 500);
  }
}

function authorize(request, env) {
  // Prefer dedicated blast secret; fall back to CRON_SECRET so existing deploys keep working.
  const secret = env.WAITLIST_BLAST_SECRET || env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return timingSafeEqual(token, secret);
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function fetchWaitlist(base, key, cohort, limit) {
  const url =
    `${base}/rest/v1/cohort_waitlist`
    + `?select=id,email,first_name,last_name,profile_id,converted_at,paid_at,cohort,created_at`
    + `&cohort=eq.${encodeURIComponent(cohort)}`
    + `&paid_at=is.null`
    + `&order=created_at.asc`
    + `&limit=${limit}`;
  const resp = await fetch(url, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`waitlist fetch failed ${resp.status}: ${detail}`);
  }
  return resp.json();
}

/** Emails that already received cohort_open (any status). */
async function fetchAlreadySent(base, key) {
  const url =
    `${base}/rest/v1/email_events`
    + `?select=to_email`
    + `&email_type=eq.${encodeURIComponent(EMAIL_TYPE)}`
    + `&limit=5000`;
  const resp = await fetch(url, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  const set = new Set();
  if (!resp.ok) return set;
  const rows = await resp.json().catch(() => []);
  for (const r of rows) {
    const e = String(r.to_email || "").trim().toLowerCase();
    if (e) set.add(e);
  }
  return set;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
