/* ==================================================================
   /functions/api/eligibility-hold.js — flag intake gate for Callie
   ==================================================================
   Authed. Persists pregnant / early-nursing fields and emails Callie.
   Does NOT refund — Callie decides via 1:1.
   ================================================================== */

import { loadUserContact, invokeEdgeFunction, logEmailEvent } from "../_shared/supabaseEmail.js";

const ALLOWED = new Set(["pregnant", "early_nursing", "early"]);

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    let reason = String(body.reason || "").slice(0, 40);
    if (reason === "early") reason = "early_nursing";
    if (!ALLOWED.has(reason)) {
      return json({ error: "invalid reason" }, 400);
    }

    await persistEligibility(env, user.id, reason, body);

    const contact = await loadUserContact(env, user.id);
    const name = contact.name || body.name || user.email;
    const email = contact.email || user.email;
    const label = reason === "pregnant" ? "pregnant" : "early nursing (<3 mo)";

    const callie = await invokeEdgeFunction(env, "notify-callie", {
      type: "eligibility_hold",
      email,
      name,
      userId: user.id,
      reason,
      stats: {
        monthsPP: body.monthsPP ?? body.months_pp ?? null,
      },
    });
    await logEmailEvent(env, {
      profileId: user.id,
      emailType: "callie_eligibility_hold",
      toEmail: "callie",
      subject: `⚠️ ${name} — ${label} (no auto-refund)`,
      resendId: callie?.data?.data?.id || callie?.data?.id || null,
      status: callie.ok ? "sent" : "failed",
      meta: { slug: "notify-callie", type: "eligibility_hold", reason },
    });

    return json({ ok: true, refunded: false }, 200);
  } catch (e) {
    console.error("eligibility-hold failed", e);
    return json({ error: "notify failed" }, 500);
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

async function persistEligibility(env, userId, reason, body) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return;

  const patch = {};
  if (reason === "pregnant") {
    patch.pregnant = true;
    patch.breastfeeding = null;
    patch.months_pp = null;
  } else if (reason === "early_nursing") {
    patch.pregnant = false;
    patch.breastfeeding = true;
    const months = body.monthsPP ?? body.months_pp;
    if (months != null && months !== "") patch.months_pp = Number(months);
  }
  if (!Object.keys(patch).length) return;

  const resp = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    console.error("eligibility persist failed", resp.status, detail);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
