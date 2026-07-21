/* ==================================================================
   /functions/api/refund.js — full eligibility refund after pay-first
   ==================================================================
   Authed. Issues Stripe refund on stored payment_intent, sets
   profiles.refunded=true / paid=false, logs row in refunds.
   Only for pre-approval eligibility declines (pregnant / early nursing).
   Diet (veg/vegan) is Callie review — not auto-refunded.
   Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   ================================================================== */

import { loadUserContact, sendRefundEmails } from "../_shared/supabaseEmail.js";

const ALLOWED_REASONS = new Set(["pregnant", "early_nursing"]);

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    let reason = String(body.reason || "intake_decline").slice(0, 80);
    if (reason === "early") reason = "early_nursing";
    if (!ALLOWED_REASONS.has(reason)) {
      return json({ error: "invalid reason" }, 400);
    }

    const profile = await fetchProfile(env, user.id);
    if (!profile) return json({ error: "profile not found" }, 404);

    if (profile.refunded) {
      return json({ ok: true, already: true }, 200);
    }
    if (!profile.paid) {
      return json({ error: "not paid" }, 409);
    }
    // Self-serve refunds only during intake / before Callie approval
    if (profile.status === "active") {
      return json({ error: "contact coach for refund" }, 403);
    }
    if (profile.macros_approved) {
      return json({ error: "contact coach for refund" }, 403);
    }
    if (!profile.stripe_payment_intent) {
      console.error("refund missing payment_intent", user.id);
      return json({ error: "missing payment" }, 422);
    }

    const secret = env.STRIPE_SECRET_KEY;
    if (!secret) {
      console.error("missing STRIPE_SECRET_KEY");
      return json({ error: "refund unavailable" }, 503);
    }

    // Persist attested eligibility reason on the profile for Callie's records
    await attestEligibility(env, user.id, reason, body);

    const stripeBody = new URLSearchParams();
    stripeBody.set("payment_intent", profile.stripe_payment_intent);
    stripeBody.set("reason", "requested_by_customer");
    stripeBody.set("metadata[supabase_user_id]", user.id);
    stripeBody.set("metadata[reason]", reason);

    const stripeResp = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: stripeBody,
    });
    const refund = await stripeResp.json().catch(() => ({}));
    if (!stripeResp.ok) {
      console.error("stripe refund error", refund);
      return json({ error: "refund failed" }, 502);
    }

    await markRefunded(env, user.id, {
      reason,
      amountCents: refund.amount ?? null,
      stripeRefundId: refund.id || null,
      paymentIntent: profile.stripe_payment_intent,
    });

    // Email #6 + Callie C — best-effort
    try {
      const contact = await loadUserContact(env, user.id);
      await sendRefundEmails(env, {
        email: contact.email || user.email,
        name: contact.name || profile.name,
        userId: user.id,
        reason,
      });
    } catch (mailErr) {
      console.error("refund email failed", mailErr);
    }

    return json({ ok: true, refund_id: refund.id || null }, 200);
  } catch (e) {
    console.error("refund failed", e);
    return json({ error: "refund failed" }, 500);
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

async function fetchProfile(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("missing SUPABASE_URL or server key");

  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=paid,refunded,stripe_payment_intent,name,status`,
    {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    }
  );
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`profile fetch failed: ${resp.status} ${detail}`);
  }
  const rows = await resp.json();
  const row = rows[0] || null;
  if (!row) return null;

  // Join macros.approved (may not exist yet during early intake gates)
  const mResp = await fetch(
    `${base}/rest/v1/macros?profile_id=eq.${encodeURIComponent(userId)}&select=approved`,
    {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    }
  );
  let macrosApproved = false;
  if (mResp.ok) {
    const mRows = await mResp.json();
    macrosApproved = !!mRows[0]?.approved;
  }

  return { ...row, macros_approved: macrosApproved };
}

async function attestEligibility(env, userId, reason, body) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return;

  const patch = {};
  if (reason === "pregnant") {
    patch.pregnant = true;
  } else if (reason === "early_nursing") {
    patch.breastfeeding = true;
    const months = body.monthsPP ?? body.months_pp;
    if (months != null && months !== "") patch.months_pp = Number(months);
  } else if (reason === "diet") {
    const diet = body.diet != null ? String(body.diet).slice(0, 40) : "restricted";
    if (diet && diet !== "none") patch.diet = diet;
    else patch.diet = "restricted";
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
    console.error("attest eligibility failed", resp.status, detail);
  }
}

async function markRefunded(env, userId, { reason, amountCents, stripeRefundId, paymentIntent }) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("missing SUPABASE_URL or server key");

  const patchResp = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      paid: false,
      refunded: true,
      status: "pending",
    }),
  });
  if (!patchResp.ok) {
    const detail = await patchResp.text();
    throw new Error(`profile refund update failed: ${patchResp.status} ${detail}`);
  }

  const logResp = await fetch(`${base}/rest/v1/refunds`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      profile_id: userId,
      reason,
      amount_cents: amountCents,
      stripe_refund_id: stripeRefundId,
      stripe_payment_intent: paymentIntent,
    }),
  });
  if (!logResp.ok) {
    const detail = await logResp.text();
    console.error("refund log insert failed", logResp.status, detail);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
