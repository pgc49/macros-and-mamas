/* ==================================================================
   /functions/api/billing.js — Client billing summary + portal
   ==================================================================
   GET  → payment history, program (week from cohort dates), membership
   POST { action: "portal" } → Stripe Customer Portal URL
   POST { action: "cancel" } → cancel the monthly membership at period end
   POST { action: "resume" } → undo that cancel so it renews again
   ================================================================== */

import {
  creditsPayloadForUi,
  listLedgerForUser,
} from "../_shared/credits.js";
import {
  billingFallbackPayments,
  stripePortalAvailable,
} from "../_shared/comp.js";
import {
  buildProgramSummaryFromCohort,
  buildSubscriptionPayload,
  fetchStripeSubscription,
  membershipAccess,
  profileWithLiveSubscription,
  setSubscriptionCancelAtPeriodEnd,
  stripeCancelScheduled,
  subscriptionOwnedByProfile,
  syncSubscriptionToProfile,
} from "../_shared/membership.js";
import { reusableStripeCustomerId } from "../_shared/stripeCustomer.js";

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

    const subId = String(profile.stripe_subscription_id || "").trim();
    const [payments, stripeSub] = await Promise.all([
      listCustomerPayments(env, profile),
      subId ? fetchStripeSubscription(env, subId) : Promise.resolve(null),
    ]);
    const viewed = profileWithLiveSubscription(profile, stripeSub) || profile;
    if (
      stripeSub?.status
      && String(stripeSub.status) !== String(profile.subscription_status || "")
    ) {
      try {
        await syncSubscriptionToProfile(env, stripeSub, { userId: user.id });
      } catch (syncErr) {
        console.error("billing subscription sync failed", syncErr);
      }
    }
    const program = buildProgramSummaryFromCohort(viewed, payments);
    const subscription = await buildSubscriptionPayload(env, viewed, new Date(), stripeSub);
    const access = membershipAccess(viewed);
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
      complimentary: !!profile.comp,
      portalAvailable: stripePortalAvailable(profile, { stripeSecret: env.STRIPE_SECRET_KEY }),
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
    const action = body?.action;
    if (action === "cancel" || action === "resume") {
      const profile = await fetchBillingProfile(env, user.id);
      if (!profile) return json({ error: "profile not found" }, 404);
      return handleMembershipChange({
        env,
        user,
        profile,
        cancel: action === "cancel",
      });
    }
    if (action !== "portal") {
      return json({ error: "unknown action" }, 400);
    }

    const profile = await fetchBillingProfile(env, user.id);
    const customerId = reusableStripeCustomerId(profile?.stripe_customer_id);
    if (!customerId || profile?.comp) {
      return json({ error: "no billing customer" }, 404);
    }
    if (profile.refunded) return json({ error: "enrollment refunded" }, 403);

    const secret = env.STRIPE_SECRET_KEY;
    if (!secret) return json({ error: "billing unavailable" }, 503);

    const origin = new URL(request.url).origin;
    const params = new URLSearchParams();
    params.set("customer", customerId);
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
  const customerId = reusableStripeCustomerId(profile.stripe_customer_id);
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

  if (!out.length) return billingFallbackPayments(profile);
  out.sort((a, b) => {
    const ta = a.created ? Date.parse(a.created) : 0;
    const tb = b.created ? Date.parse(b.created) : 0;
    return tb - ta;
  });
  return out;
}

function fallbackFromProfile(profile) {
  return billingFallbackPayments(profile);
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
    + `&select=id,role,paid,refunded,comp,paid_at,week,cohort_label,tier,stripe_customer_id,stripe_payment_intent,stripe_subscription_id,subscription_status,subscription_current_period_end,subscription_trial_end`;
  const resp = await fetch(url, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

const OPEN_SUB_STATUSES = new Set(["trialing", "active", "past_due"]);

async function handleMembershipChange({ env, user, profile, cancel }) {
  if (profile.refunded) return json({ error: "enrollment refunded" }, 403);
  const subId = String(profile.stripe_subscription_id || "").trim();
  if (!subId) {
    return json({ error: "There’s no monthly membership on this account." }, 404);
  }
  if (!env.STRIPE_SECRET_KEY) return json({ error: "billing unavailable" }, 503);

  const stripeSub = await fetchStripeSubscription(env, subId);
  if (!stripeSub?.id) {
    return json({ error: "Couldn't update membership. Try again in a moment." }, 502);
  }
  if (!subscriptionOwnedByProfile(profile, stripeSub, user.id)) {
    return json({ error: "This membership doesn’t match your account." }, 403);
  }

  const liveStatus = String(stripeSub.status || "");
  if (!OPEN_SUB_STATUSES.has(liveStatus)) {
    return json({
      error: "This membership has already ended. Subscribe again from this page.",
    }, 409);
  }

  let current = stripeSub;
  if (stripeCancelScheduled(stripeSub) !== cancel) {
    const updated = await setSubscriptionCancelAtPeriodEnd(env, subId, cancel, stripeSub);
    if (!updated.ok || !updated.subscription) {
      return json({ error: "Couldn't update membership. Try again in a moment." }, 502);
    }
    current = updated.subscription;
    try {
      await syncSubscriptionToProfile(env, current, { userId: user.id });
    } catch (syncErr) {
      console.error("membership manage sync failed", syncErr);
    }
  }

  const viewed = profileWithLiveSubscription(profile, current) || profile;
  const subscription = await buildSubscriptionPayload(env, viewed, new Date(), current);
  return json({ subscription }, 200);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
