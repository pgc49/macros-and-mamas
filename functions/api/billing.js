/* ==================================================================
   /functions/api/billing.js — Client billing summary (past + upcoming shell)
   ==================================================================
   GET  → payment history from Stripe + program / subscription shell
   POST { action: "portal" } → Stripe Customer Portal URL (when configured)

   Env: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY,
        optional STRIPE_BILLING_PORTAL_CONFIGURATION
   ================================================================== */

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const profile = await fetchBillingProfile(env, user.id);
    if (!profile) return json({ error: "profile not found" }, 404);
    if (profile.refunded) return json({ error: "enrollment refunded" }, 403);
    if (!profile.paid && profile.role !== "admin") {
      return json({ error: "not enrolled" }, 403);
    }

    const payments = await listCustomerPayments(env, profile);
    const program = buildProgramSummary(profile, payments);
    const subscription = buildSubscriptionShell(profile);

    return json({
      email: user.email || null,
      program,
      payments,
      subscription,
      portalAvailable: !!env.STRIPE_SECRET_KEY && !!profile.stripe_customer_id,
    });
  } catch (e) {
    console.error("billing get failed", e);
    return json({ error: "billing unavailable" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    if (body?.action !== "portal") {
      return json({ error: "unknown action" }, 400);
    }

    const profile = await fetchBillingProfile(env, user.id);
    if (!profile?.stripe_customer_id) {
      return json({ error: "no billing customer" }, 404);
    }
    if (profile.refunded) return json({ error: "enrollment refunded" }, 403);

    const secret = env.STRIPE_SECRET_KEY;
    if (!secret) return json({ error: "billing unavailable" }, 503);

    const origin = new URL(request.url).origin;
    const params = new URLSearchParams();
    params.set("customer", profile.stripe_customer_id);
    params.set("return_url", `${origin}/account/payments`);
    if (env.STRIPE_BILLING_PORTAL_CONFIGURATION) {
      params.set("configuration", env.STRIPE_BILLING_PORTAL_CONFIGURATION);
    }

    const resp = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("stripe portal error", data);
      return json({
        error: "portal unavailable",
        detail: "Stripe Customer Portal isn’t configured yet — history still works below.",
      }, 503);
    }
    return json({ url: data.url }, 200);
  } catch (e) {
    console.error("billing portal failed", e);
    return json({ error: "billing unavailable" }, 500);
  }
}

function buildProgramSummary(profile, payments) {
  const latest = payments.find((p) => p.status === "succeeded") || payments[0] || null;
  const paidAt = profile.paid_at || latest?.created || null;
  const week = Number(profile.week) || 0;
  let phase = "not_started";
  if (profile.paid) {
    phase = week >= 8 ? "program_complete" : "in_program";
  }
  return {
    paid: !!profile.paid,
    paidAt,
    week,
    phase,
    label: latest?.description || "8-week program",
    amount: latest?.amount ?? null,
    currency: latest?.currency || "usd",
    receiptUrl: latest?.receiptUrl || null,
  };
}

/** Shell only — monthly access after week 8 is not configured yet. */
function buildSubscriptionShell(profile) {
  const week = Number(profile.week) || 0;
  return {
    status: "not_offered",
    priceLabel: null,
    amount: null,
    currency: "usd",
    renewsAt: null,
    cancelAtPeriodEnd: false,
    note: week >= 8
      ? "Monthly access after the 8-week program isn’t open yet. You’ll see options here when it launches — you can opt out anytime."
      : "After your 8 weeks, we may offer an optional monthly membership so you can keep the app. Nothing will charge automatically until you choose it.",
  };
}

async function listCustomerPayments(env, profile) {
  const secret = env.STRIPE_SECRET_KEY;
  if (!secret) return fallbackFromProfile(profile);

  const out = [];
  const customerId = profile.stripe_customer_id;

  if (customerId) {
    const url =
      `https://api.stripe.com/v1/charges`
      + `?customer=${encodeURIComponent(customerId)}`
      + `&limit=20`;
    const resp = await fetch(url, {
      headers: { authorization: `Bearer ${secret}` },
    });
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      for (const ch of data.data || []) {
        out.push(mapCharge(ch));
      }
    } else {
      console.error("stripe charges list failed", resp.status, await resp.text());
    }
  }

  // Fallback: single PI from checkout if charges list empty
  if (!out.length && profile.stripe_payment_intent) {
    const piUrl = `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(profile.stripe_payment_intent)}`;
    const resp = await fetch(piUrl, {
      headers: { authorization: `Bearer ${secret}` },
    });
    if (resp.ok) {
      const pi = await resp.json().catch(() => null);
      if (pi) out.push(mapPaymentIntent(pi, profile));
    }
  }

  if (!out.length) return fallbackFromProfile(profile);
  return out;
}

function fallbackFromProfile(profile) {
  if (!profile.paid) return [];
  return [{
    id: profile.stripe_payment_intent || "program",
    created: profile.paid_at,
    amount: null,
    currency: "usd",
    status: "succeeded",
    description: "8-week program",
    receiptUrl: null,
    brand: null,
    last4: null,
  }];
}

function mapCharge(ch) {
  const amount = typeof ch.amount === "number" ? ch.amount / 100 : null;
  return {
    id: ch.id,
    created: ch.created ? new Date(ch.created * 1000).toISOString() : null,
    amount,
    currency: ch.currency || "usd",
    status: ch.status || (ch.paid ? "succeeded" : "pending"),
    description: ch.description || ch.billing_details?.name || "Payment",
    receiptUrl: ch.receipt_url || null,
    brand: ch.payment_method_details?.card?.brand || null,
    last4: ch.payment_method_details?.card?.last4 || null,
  };
}

function mapPaymentIntent(pi, profile) {
  const amount = typeof pi.amount === "number" ? pi.amount / 100 : null;
  const tier = pi.metadata?.price_tier;
  const label = tier
    ? `${String(tier).charAt(0).toUpperCase()}${String(tier).slice(1)} — 8-week program`
    : "8-week program";
  return {
    id: pi.id,
    created: pi.created
      ? new Date(pi.created * 1000).toISOString()
      : profile.paid_at,
    amount,
    currency: pi.currency || "usd",
    status: pi.status === "succeeded" ? "succeeded" : pi.status,
    description: label,
    receiptUrl: null,
    brand: null,
    last4: null,
  };
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

async function fetchBillingProfile(env, userId) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) return null;
  const url =
    `${base}/rest/v1/profiles`
    + `?id=eq.${encodeURIComponent(userId)}`
    + `&select=id,role,paid,refunded,paid_at,week,stripe_customer_id,stripe_payment_intent`;
  const resp = await fetch(url, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
