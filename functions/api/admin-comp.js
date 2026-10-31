/* ==================================================================
   /functions/api/admin-comp.js — mark / clear complimentary + welcome
   ==================================================================
   Admin-only. Body: { clientId, comp, name? }
   Marking sets paid=true for dashboard access, stamps the current
   enrollment cohort (Cohort 2), and sends welcome (#2) once.
   Never writes Stripe ids or emails Callie a payment ping.
   Clearing complimentary does not send mail or change her group.
   ================================================================== */

import { handlePaidEnrollmentChannel } from "../_shared/channels.js";
import { loadUserContact, sendWelcomeMamaEmail } from "../_shared/supabaseEmail.js";

export async function onRequestPost({ request, env }) {
  try {
    const admin = await requireUser(request, env);
    if (!admin) return json({ error: "unauthorized" }, 401);

    const isAdmin = await checkAdmin(env, admin.id);
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await request.json().catch(() => ({}));
    const clientId = String(body.clientId || "").trim();
    if (!clientId) return json({ error: "missing clientId" }, 400);
    if (typeof body.comp !== "boolean") return json({ error: "missing comp" }, 400);

    const next = body.comp;
    const row = await setClientComp(env, clientId, next);
    const result = {
      ok: true,
      comp: !!row.comp,
      paid: !!row.paid,
      welcome: "skipped",
      cohort_label: row.cohort_label || null,
    };

    if (!next) return json(result, 200);

    try {
      const cohort = await handlePaidEnrollmentChannel(env, clientId);
      if (cohort?.label) result.cohort_label = cohort.label;
    } catch (e) {
      console.error("admin-comp cohort assign failed", clientId, e);
    }

    const contact = await loadUserContact(env, clientId);
    const email = contact.email;
    const name = contact.name
      || String(body.name || "").trim()
      || null;
    if (!email) {
      result.welcome = "skipped";
      return json(result, 200);
    }

    const sent = await sendWelcomeMamaEmail(env, {
      email,
      name,
      userId: clientId,
      source: "comp",
    });
    if (sent?.ok) result.welcome = "sent";
    else if (sent?.skipped === "already_sent") result.welcome = "already_sent";
    else if (sent?.skipped) result.welcome = "skipped";
    else result.welcome = "failed";

    return json(result, 200);
  } catch (e) {
    console.error("admin-comp failed", e);
    return json({ error: "comp update failed" }, 500);
  }
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

async function checkAdmin(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return false;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return false;
  const rows = await resp.json().catch(() => []);
  return rows[0]?.role === "admin";
}

async function setClientComp(env, clientId, comp) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("missing supabase config");

  const next = !!comp;
  const patch = next ? { comp: true, paid: true } : { comp: false };
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(clientId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    },
  );
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`comp update failed: ${resp.status} ${detail}`);
  }
  const rows = await resp.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new Error("comp update returned no row");
  return row;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
