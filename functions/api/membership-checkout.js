/* ==================================================================
   /functions/api/membership-checkout.js — Alumni $49 opt-in Checkout
   ==================================================================
   POST → Stripe Checkout Session mode=subscription. Trial pinned to
   founding free-month end, or to programEnd for later cohorts still
   in the 8 weeks. After that date, no trial. Never auto-created.
   ================================================================== */

import { alumniPriceId } from "../_shared/pricing.js";
import { trialEndUnixForCheckout } from "../_shared/membership.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const profile = await fetchProfile(env, user.id);
    if (!profile) return json({ error: "profile not found" }, 404);
    if (profile.refunded) return json({ error: "enrollment refunded" }, 403);
    if (!profile.paid && profile.role !== "admin") {
      return json({ error: "not enrolled" }, 403);
    }
    if (profile.tier === "alumni_19") {
      return json({ error: "already on save rate" }, 409);
    }
    if (
      profile.subscription_status === "trialing"
      || profile.subscription_status === "active"
    ) {
      return json({ error: "already subscribed" }, 409);
    }

    const priceId = alumniPriceId(env);
    if (!priceId) {
      console.error("missing PRICE_ALUMNI_49");
      return json({ error: "membership unavailable" }, 503);
    }

    const secret = env.STRIPE_SECRET_KEY;
    if (!secret) return json({ error: "membership unavailable" }, 503);

    const origin = new URL(request.url).origin;
    const body = new URLSearchParams();
    body.set("mode", "subscription");
    body.set("success_url", `${origin}/account/payments?membership=success`);
    body.set("cancel_url", `${origin}/account/payments?membership=cancel`);
    body.set("client_reference_id", user.id);
    body.set("line_items[0][price]", priceId);
    body.set("line_items[0][quantity]", "1");
    body.set("metadata[supabase_user_id]", user.id);
    body.set("metadata[kind]", "alumni_membership");
    body.set("subscription_data[metadata][supabase_user_id]", user.id);
    body.set("subscription_data[metadata][kind]", "alumni_membership");

    const trialEnd = trialEndUnixForCheckout(profile);
    if (trialEnd) {
      body.set("subscription_data[trial_end]", String(trialEnd));
    }

    if (profile.stripe_customer_id) {
      body.set("customer", profile.stripe_customer_id);
    } else {
      body.set("customer_email", user.email || "");
      body.set("customer_creation", "always");
    }

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("membership checkout error", data);
      return json({ error: "checkout failed" }, 502);
    }
    return json({ url: data.url, sessionId: data.id }, 200);
  } catch (e) {
    console.error("membership-checkout failed", e);
    return json({ error: "membership unavailable" }, 500);
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
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) return null;
  const url =
    `${base}/rest/v1/profiles`
    + `?id=eq.${encodeURIComponent(userId)}`
    + `&select=id,role,paid,refunded,paid_at,week,cohort_label,tier,stripe_customer_id,stripe_subscription_id,subscription_status,subscription_current_period_end,subscription_trial_end`;
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
