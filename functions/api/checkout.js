/* ==================================================================
   /functions/api/checkout.js — Create a Stripe Checkout Session
   ==================================================================
   Secrets / env (Cloudflare Pages / .dev.vars):
     STRIPE_SECRET_KEY
     STRIPE_PRICE_ID_FOUNDING  ($149; falls back to STRIPE_PRICE_ID)
     STRIPE_PRICE_ID_WAITLIST  ($249)
     STRIPE_PRICE_ID_FULL      ($299)
     STRIPE_PRICE_ID_LAB_ADDON ($349 The Lab Review; optional)
     SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
     ENROLLMENT_OPEN / ENROLLMENT_CLOSED_AT / WAITLIST_COHORT
   ================================================================== */

import {
  LAB_ADDON_AMOUNT,
  labAddonPriceId,
  resolveCheckoutOffer,
} from "../_shared/pricing.js";
import {
  clientIpFromRequest,
  newEventId,
  sendMetaCapiEvent,
} from "../_shared/metaCapi.js";

export async function onRequestPost({ request, env }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const profile = await fetchProfile(env, user.id, authHeader);
    if (profile?.refunded) {
      return json({ error: "enrollment refunded" }, 403);
    }
    if (profile?.paid) {
      return json({ error: "already paid" }, 409);
    }

    // Prefer auth.users.created_at (immutable) over profiles.created_at.
    const offer = await resolveCheckoutOffer(env, {
      email: user.email,
      createdAt: user.created_at || profile?.created_at,
    });
    if (!offer.ok) {
      return json({ error: offer.error }, offer.status || 403);
    }

    const secret = env.STRIPE_SECRET_KEY;
    if (!secret) {
      console.error("missing STRIPE_SECRET_KEY");
      return json({ error: "checkout unavailable" }, 503);
    }

    let clientBody = {};
    try {
      clientBody = await request.json();
    } catch {
      clientBody = {};
    }

    const eventId = String(clientBody.event_id || "").trim() || newEventId("ic");
    const fbp = String(clientBody.fbp || "").trim().slice(0, 128);
    const fbc = String(clientBody.fbc || "").trim().slice(0, 128);
    const fbclid = String(clientBody.fbclid || "").trim().slice(0, 200);
    const utmSource = String(clientBody.utm_source || "").trim().slice(0, 120);
    const utmMedium = String(clientBody.utm_medium || "").trim().slice(0, 120);
    const utmCampaign = String(clientBody.utm_campaign || "").trim().slice(0, 120);
    const utmContent = String(clientBody.utm_content || "").trim().slice(0, 120);
    const utmTerm = String(clientBody.utm_term || "").trim().slice(0, 120);
    const anonId = String(clientBody.anon_id || "").trim().slice(0, 64);
    const landingPath = String(clientBody.landing_path || "").trim().slice(0, 200);
    const referrerHost = String(clientBody.referrer_host || "").trim().slice(0, 200);
    const wantLabReview = Boolean(clientBody.lab_review);
    const clientIp = clientIpFromRequest(request);
    const clientUa = (request.headers.get("user-agent") || "").slice(0, 480);

    let labPriceId = "";
    if (wantLabReview) {
      labPriceId = labAddonPriceId(env);
      if (!labPriceId) {
        console.error("missing STRIPE_PRICE_ID_LAB_ADDON");
        return json({ error: "lab add-on unavailable" }, 503);
      }
    }

    const totalAmount = offer.amount + (wantLabReview ? LAB_ADDON_AMOUNT : 0);

    const origin = new URL(request.url).origin;
    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("success_url", `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`);
    body.set("cancel_url", `${origin}/join`);
    body.set("client_reference_id", user.id);
    // Always create a Stripe Customer so Payments portal + stage 4 have an id.
    // Does NOT set setup_future_usage — cards are not saved for one-tap yet (stage 4).
    body.set("customer_creation", "always");
    body.set("customer_email", user.email || "");
    body.set("line_items[0][price]", offer.priceId);
    body.set("line_items[0][quantity]", "1");
    if (wantLabReview) {
      body.set("line_items[1][price]", labPriceId);
      body.set("line_items[1][quantity]", "1");
    }
    // TODO(lab-panel): optional Callie-ordered blood panel ($200) as a later
    // separate checkout or third line item when UI exists.
    body.set("metadata[supabase_user_id]", user.id);
    body.set("metadata[price_tier]", offer.tier);
    body.set("metadata[amount_usd]", String(totalAmount));
    body.set("metadata[lab_review]", wantLabReview ? "true" : "false");
    body.set("metadata[event_id]", eventId);
    if (fbp) body.set("metadata[fbp]", fbp);
    if (fbc) body.set("metadata[fbc]", fbc);
    if (fbclid) body.set("metadata[fbclid]", fbclid);
    if (utmSource) body.set("metadata[utm_source]", utmSource);
    if (utmMedium) body.set("metadata[utm_medium]", utmMedium);
    if (utmCampaign) body.set("metadata[utm_campaign]", utmCampaign);
    if (utmContent) body.set("metadata[utm_content]", utmContent);
    if (utmTerm) body.set("metadata[utm_term]", utmTerm);
    if (anonId) body.set("metadata[anon_id]", anonId);
    if (landingPath) body.set("metadata[landing_path]", landingPath);
    if (referrerHost) body.set("metadata[referrer_host]", referrerHost);
    if (clientIp) body.set("metadata[client_ip]", clientIp.slice(0, 64));
    if (clientUa) body.set("metadata[client_ua]", clientUa);

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("stripe checkout error", data);
      return json({ error: "checkout failed" }, 502);
    }

    // InitiateCheckout CAPI (best-effort)
    try {
      await sendMetaCapiEvent(env, {
        eventName: "InitiateCheckout",
        eventId,
        email: user.email,
        fbp,
        fbc,
        eventSourceUrl: `${origin}/join`,
        clientIp,
        clientUa,
        customData: {
          currency: "USD",
          value: Number(totalAmount) || 0,
          content_name: wantLabReview
            ? `checkout_${offer.tier}_lab`
            : `checkout_${offer.tier}`,
        },
      });
    } catch (metaErr) {
      console.error("InitiateCheckout CAPI failed", metaErr);
    }

    return json({
      url: data.url,
      id: data.id,
      tier: offer.tier,
      amount: offer.amount,
      label: offer.label,
      event_id: eventId,
    }, 200);
  } catch (e) {
    console.error("checkout failed", e);
    return json({ error: "checkout failed" }, 500);
  }
}

async function requireUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!base) {
    console.error("missing SUPABASE_URL");
    return null;
  }

  const resp = await fetch(`${base.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "",
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function fetchProfile(env, userId, authHeader) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  const service = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !userId) return null;

  const apikey = service || anon;
  const authorization = service ? `Bearer ${service}` : authHeader;
  if (!apikey || !authorization) return null;

  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=paid,refunded,created_at`,
    {
      headers: {
        apikey,
        authorization,
      },
    }
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
