/* ==================================================================
   /functions/api/unpaid-leads-blast.js — one more note to unpaid quiz leads
   ==================================================================
   Auth: Bearer Supabase JWT + profiles.role = admin

   POST { dryRun?: true }
     dryRun (default true) counts who would get the email.
     dryRun: false sends once per address (idempotent via email_events).
   ================================================================== */

import {
  UNPAID_ONE_MORE_TYPE,
  alreadySentSet,
  loadUnsubscribedSet,
  selectEmailableUnpaidLeads,
  sendUnpaidOneMoreEmail,
  unpaidOneMorePreviewText,
  unpaidOneMoreSubject,
} from "../_shared/unpaidLeadsBlast.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;

    const [leads, profiles, events, unsub] = await Promise.all([
      sbGet(env, "/rest/v1/marketing_leads?select=id,email,first_name,segment,created_at&order=created_at.desc&limit=2000"),
      sbGet(env, "/rest/v1/profiles?role=neq.admin&select=id,email,name,paid,comp,role"),
      sbGet(
        env,
        `/rest/v1/email_events?email_type=eq.${encodeURIComponent(UNPAID_ONE_MORE_TYPE)}&status=eq.sent&select=to_email,email_type,status&limit=5000`,
      ),
      loadUnsubscribedSet(env),
    ]);

    if (!unsub.ok) {
      return json({ error: "unsubscribe list unavailable" }, 503);
    }

    const { recipients, skipped, unpaidLeads } = selectEmailableUnpaidLeads({
      leads,
      profiles,
      unsubscribed: unsub.emails,
      alreadySent: alreadySentSet(events),
    });

    const sampleName = recipients[0]?.firstName || "Mama";
    const summary = {
      dryRun,
      unpaidLeads,
      candidates: recipients.length,
      sent: 0,
      skipped,
      errors: 0,
      subject: unpaidOneMoreSubject(sampleName),
      preview: unpaidOneMorePreviewText(sampleName),
      usesFirstName: true,
      samples: recipients.slice(0, 5).map((row) => ({
        email: row.email,
        name: row.firstName || "Mama",
      })),
    };

    if (dryRun) {
      summary.sent = recipients.length;
      return json(summary, 200);
    }

    for (const row of recipients) {
      const result = await sendUnpaidOneMoreEmail(env, row);
      if (result.ok) summary.sent += 1;
      else summary.errors += 1;
    }

    return json(summary, 200);
  } catch (e) {
    console.error("unpaid-leads-blast failed", e);
    return json({ error: "blast failed" }, 500);
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
