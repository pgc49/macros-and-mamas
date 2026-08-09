/* ==================================================================
   /functions/api/billing.js — Client billing summary + portal
   ==================================================================
   GET  → payment history, program (week from cohort dates), membership
   POST { action: "portal" } → Stripe Customer Portal URL
   ================================================================== */

import {
  creditsPayloadForUi,
  listLedgerForUser,
} from "../_shared/credits.js";
import {
  buildProgramSummaryFromCohort,
  buildSubscriptionPayload,
  membershipAccess,
} from "../_shared/membership.js";

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
    const program = buildProgramSummaryFromCohort(profile, payments);
    const subscription = await buildSubscriptionPayload(env, profile);
    const access = membershipAccess(profile);
    let credits = null;
    try {
      const ledger = await listLedgerForUser(env, user.id);
      credits = creditsPayloadForUi(ledger);
    } catch (creditErr) {
      console.error("billing credits load failed", creditErr);
    }

    return json({
      email: user.email || null,
      program,
      payments,
      subscription,
      access,
      credits,
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

async function listCustomerPayments(env, profile) {
  const secret = env.STRIPE_SECRET_KEY;
  if (!secret) return fallbackFromProfile(profile);

  const out = [];
  const customerId = profile.stripe_customer_id;
  const seen = new Set();

  if (customerId) {
    // One-time charges (program checkout)
    const chargeUrl =
      `https://api.stripe.com/v1/charges`
      + `?customer=${encodeURIComponent(customerId)}`
      + `&limit=20`;
    const chargeResp = await fetch(chargeUrl, {
      headers: { authorization: `Bearer ${secret}` },
    });
    if (chargeResp.ok) {
      const data = await chargeResp.json().catch(() => ({}));
      for (const ch of data.data || []) {
        // Prefer invoices for subscription payments — skip invoice-backed charges to avoid doubles.
        if (ch.invoice) continue;
        const row = mapCharge(ch);
        if (row.id && !seen.has(row.id)) {
          seen.add(row.id);
          out.push(row);
        }
      }
    } else {
      console.error("stripe charges list failed", chargeResp.status, await chargeResp.text());
    }

    // Subscription invoices (membership)
    const invUrl =
      `https://api.stripe.com/v1/invoices`
      + `?customer=${encodeURIComponent(customerId)}`
      + `&limit=20`
      + `&status=paid`;
    const invResp = await fetch(invUrl, {
      headers: { authorization: `Bearer ${secret}` },
    });
    if (invResp.ok) {
      const data = await invResp.json().catch(() => ({}));
      for (const inv of data.data || []) {
        // Skip $0 trial invoices cluttering history
        if (!inv.amount_paid && !inv.amount_due) continue;
        const row = mapInvoice(inv);
        if (row.id && !seen.has(row.id)) {
          seen.add(row.id);
          out.push(row);
        }
      }
    } else {
      console.error("stripe invoices list failed", invResp.status, await invResp.text());
    }
  }

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
  out.sort((a, b) => {
    const ta = a.created ? Date.parse(a.created) : 0;
    const tb = b.created ? Date.parse(b.created) : 0;
    return tb - ta;
  });
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

function mapInvoice(inv) {
  const amount = typeof inv.amount_paid === "number" ? inv.amount_paid / 100 : null;
  const lines = inv.lines?.data || [];
  const firstDesc = lines[0]?.description || "";
  const isMembership = /alumni|membership|macros and mamas/i.test(firstDesc)
    || String(inv.subscription || "").startsWith("sub_");
  return {
    id: inv.id,
    created: inv.created ? new Date(inv.created * 1000).toISOString() : null,
    amount,
    currency: inv.currency || "usd",
    status: inv.status === "paid" ? "succeeded" : inv.status,
    description: isMembership
      ? (firstDesc || "Monthly membership")
      : (firstDesc || inv.description || "Invoice"),
    receiptUrl: inv.hosted_invoice_url || inv.invoice_pdf || null,
    brand: null,
    last4: null,
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
    + `&select=id,role,paid,refunded,paid_at,week,cohort_label,tier,stripe_customer_id,stripe_payment_intent,stripe_subscription_id,subscription_status,subscription_current_period_end,subscription_trial_end,subscription_cancel_at_period_end`;
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
