/* ==================================================================
   /functions/api/cohort-open-announce.js
   Manual note: next group starts November 2.
   Audience: unpaid quiz leads + unpaid non-comp signups.
   Auth: Bearer Supabase JWT + profiles.role = admin

   POST { dryRun?: true }
     dryRun defaults to true.
   ================================================================== */

import {
  COHORT_OPEN_ANNOUNCE_TYPE,
  cohortOpenPreviewText,
  cohortOpenSubject,
  selectCohortOpenRecipients,
  sendCohortOpenEmail,
} from "../_shared/cohortOpenAnnounce.js";
import { loadUnsubscribedSet } from "../_shared/unpaidLeadsBlast.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;

    const [leads, profiles, events, unsub] = await Promise.all([
      sbGet(env, "/rest/v1/marketing_leads?select=id,email,first_name,segment,created_at&order=created_at.desc&limit=5000"),
      sbGet(env, "/rest/v1/profiles?select=id,email,name,paid,comp,refunded,role&limit=5000"),
      sbGet(
        env,
        `/rest/v1/email_events?email_type=eq.${encodeURIComponent(COHORT_OPEN_ANNOUNCE_TYPE)}&status=eq.sent&select=to_email,email_type,status&limit=5000`,
      ),
      loadUnsubscribedSet(env),
    ]);

    if (!unsub.ok) {
      return json({ error: "unsubscribe list unavailable" }, 503);
    }

    const alreadySent = new Set(
      (events || [])
        .filter((row) => row?.status === "sent" && row?.email_type === COHORT_OPEN_ANNOUNCE_TYPE)
        .map((row) => String(row.to_email || "").trim().toLowerCase())
        .filter(Boolean),
    );

    const { recipients, skipped } = selectCohortOpenRecipients({
      leads,
      profiles,
      unsubscribed: unsub.emails,
      alreadySent,
    });

    const sample = recipients[0] || { firstName: "Mama", hasAccount: false };
    const summary = {
      dryRun,
      candidates: recipients.length,
      sent: 0,
      skipped,
      errors: 0,
      subject: cohortOpenSubject(sample.firstName),
      preview: cohortOpenPreviewText(sample.firstName, sample.hasAccount),
      samples: recipients.slice(0, 8).map((row) => ({
        email: row.email,
        name: row.firstName || "Mama",
        hasAccount: row.hasAccount,
      })),
    };

    if (dryRun) {
      return json(summary, 200);
    }

    for (const row of recipients) {
      const result = await sendCohortOpenEmail(env, row);
      if (result.ok) summary.sent += 1;
      else summary.errors += 1;
    }

    return json(summary, 200);
  } catch (e) {
    console.error("cohort-open-announce failed", e);
    return json({ error: "announce failed" }, 500);
  }
}

async function sbGet(env, path) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) throw new Error("missing supabase config");
  const resp = await fetch(`${base}${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`supabase ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function isAdmin(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return false;
  const rows = await resp.json().catch(() => []);
  return rows[0]?.role === "admin";
}

async function requireUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!base) return null;
  const resp = await fetch(`${base.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "",
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
