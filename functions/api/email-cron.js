/* ==================================================================
   /functions/api/email-cron.js — hourly lifecycle nudges (#1, #3)
   ==================================================================
   Auth: Authorization: Bearer $CRON_SECRET  (Cloudflare secret)
   Or invoke via GitHub Actions schedule (no local CLI needed).

   #1 Finish joining: unpaid, created ≥1h / ≥24h (max two sends)
   #3 Intake reminder: paid, no macros, paid_at ≥24h / ≥72h (max two)
   ================================================================== */

import {
  loadUserContact,
  sendFinishJoiningEmail,
  sendIntakeReminderEmail,
} from "../_shared/supabaseEmail.js";

const HOUR = 60 * 60 * 1000;

export async function onRequestPost({ request, env }) {
  try {
    if (!authorize(request, env)) return json({ error: "unauthorized" }, 401);

    const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) return json({ error: "missing supabase config" }, 503);

    const now = Date.now();
    const sent = {
      finish_joining_1h: 0,
      finish_joining_24h: 0,
      intake_reminder_24h: 0,
      intake_reminder_72h: 0,
      skipped: 0,
      errors: 0,
    };

    const profiles = await fetchAllProfiles(base, key);
    const macrosIds = await fetchMacroProfileIds(base, key);
    const already = await fetchSentTypes(base, key);

    for (const p of profiles) {
      if (p.role === "admin" || p.refunded) continue;

      const createdMs = p.created_at ? Date.parse(p.created_at) : NaN;
      const paidMs = p.paid_at ? Date.parse(p.paid_at) : NaN;
      const types = already.get(p.id) || new Set();

      try {
        // #1 — unpaid abandoned checkout
        if (!p.paid && Number.isFinite(createdMs)) {
          const age = now - createdMs;
          if (age >= 24 * HOUR && !types.has("finish_joining_24h")) {
            // Prefer 24h if due; still ok if 1h never sent
            const contact = await loadUserContact(env, p.id);
            if (contact.email) {
              const r = await sendFinishJoiningEmail(env, {
                email: contact.email,
                name: contact.name || p.name,
                userId: p.id,
                variant: "24h",
              });
              if (r?.ok) sent.finish_joining_24h += 1;
              else sent.errors += 1;
            } else sent.skipped += 1;
          } else if (
            age >= 1 * HOUR
            && age < 24 * HOUR
            && !types.has("finish_joining_1h")
            && !types.has("finish_joining_24h")
          ) {
            const contact = await loadUserContact(env, p.id);
            if (contact.email) {
              const r = await sendFinishJoiningEmail(env, {
                email: contact.email,
                name: contact.name || p.name,
                userId: p.id,
                variant: "1h",
              });
              if (r?.ok) sent.finish_joining_1h += 1;
              else sent.errors += 1;
            } else sent.skipped += 1;
          }
        }

        // #3 — paid, intake incomplete
        if (p.paid && !macrosIds.has(p.id) && Number.isFinite(paidMs)) {
          const age = now - paidMs;
          if (age >= 72 * HOUR && !types.has("intake_reminder_72h")) {
            const contact = await loadUserContact(env, p.id);
            if (contact.email) {
              const r = await sendIntakeReminderEmail(env, {
                email: contact.email,
                name: contact.name || p.name,
                userId: p.id,
                variant: "72h",
              });
              if (r?.ok) sent.intake_reminder_72h += 1;
              else sent.errors += 1;
            } else sent.skipped += 1;
          } else if (
            age >= 24 * HOUR
            && age < 72 * HOUR
            && !types.has("intake_reminder_24h")
            && !types.has("intake_reminder_72h")
          ) {
            const contact = await loadUserContact(env, p.id);
            if (contact.email) {
              const r = await sendIntakeReminderEmail(env, {
                email: contact.email,
                name: contact.name || p.name,
                userId: p.id,
                variant: "24h",
              });
              if (r?.ok) sent.intake_reminder_24h += 1;
              else sent.errors += 1;
            } else sent.skipped += 1;
          }
        }
      } catch (e) {
        console.error("email-cron profile failed", p.id, e);
        sent.errors += 1;
      }
    }

    return json({ ok: true, sent }, 200);
  } catch (e) {
    console.error("email-cron failed", e);
    return json({ error: "cron failed" }, 500);
  }
}

function authorize(request, env) {
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET not set");
    return false;
  }
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token && token === secret;
}

async function fetchAllProfiles(base, key) {
  const resp = await fetch(
    `${base}/rest/v1/profiles?select=id,name,role,paid,refunded,created_at,paid_at&order=created_at.asc`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  if (!resp.ok) throw new Error(`profiles ${resp.status}`);
  return resp.json();
}

async function fetchMacroProfileIds(base, key) {
  const resp = await fetch(
    `${base}/rest/v1/macros?select=profile_id`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  if (!resp.ok) throw new Error(`macros ${resp.status}`);
  const rows = await resp.json();
  return new Set((rows || []).map((r) => r.profile_id));
}

async function fetchSentTypes(base, key) {
  const types = [
    "finish_joining_1h",
    "finish_joining_24h",
    "intake_reminder_24h",
    "intake_reminder_72h",
  ];
  const filter = types.map((t) => `"${t}"`).join(",");
  const resp = await fetch(
    `${base}/rest/v1/email_events?select=profile_id,email_type,status&email_type=in.(${filter})&status=eq.sent`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  const map = new Map();
  if (!resp.ok) {
    console.error("email_events fetch failed", resp.status, await resp.text());
    return map;
  }
  const rows = await resp.json();
  for (const r of rows || []) {
    if (!r.profile_id) continue;
    if (!map.has(r.profile_id)) map.set(r.profile_id, new Set());
    map.get(r.profile_id).add(r.email_type);
  }
  return map;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
