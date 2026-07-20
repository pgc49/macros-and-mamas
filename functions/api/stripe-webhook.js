/* ==================================================================
   /functions/api/stripe-webhook.js — mark profile paid after Checkout
   ==================================================================
   Secrets (Cloudflare Pages / .dev.vars — never commit real values):
     STRIPE_WEBHOOK_SECRET
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY   (server-side only)
   ================================================================== */

export async function onRequestPost({ request, env }) {
  try {
    const rawBody = await request.text();
    const sig = request.headers.get("stripe-signature");
    if (!sig || !env.STRIPE_WEBHOOK_SECRET) {
      return json({ error: "unauthorized" }, 401);
    }

    const event = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
    if (!event) return json({ error: "invalid signature" }, 400);

    if (event.type === "checkout.session.completed") {
      const session = event.data?.object || {};
      const userId =
        session.metadata?.supabase_user_id ||
        session.client_reference_id;

      if (!userId) {
        console.error("checkout.session.completed missing user id", session.id);
        return json({ error: "missing user" }, 400);
      }

      await markPaid(env, userId, session);
    }

    return json({ received: true }, 200);
  } catch (e) {
    console.error("stripe webhook failed", e);
    return json({ error: "webhook failed" }, 500);
  }
}

async function markPaid(env, userId, session) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    throw new Error("missing SUPABASE_URL or server key");
  }

  // Do NOT set status=active here — that means Callie approved.
  // Payment only flips paid + stores Stripe ids for refunds.
  const patch = {
    paid: true,
    refunded: false,
    paid_at: new Date().toISOString(),
  };
  if (session.customer) patch.stripe_customer_id = String(session.customer);
  const pi = session.payment_intent;
  if (pi) patch.stripe_payment_intent = String(pi);

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
    throw new Error(`supabase update failed: ${resp.status} ${detail}`);
  }
}

/** Verify Stripe-Signature header (t=,v1=) with Web Crypto HMAC-SHA256. */
async function verifyStripeSignature(rawBody, header, secret) {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...rest] = p.split("=");
      return [k.trim(), rest.join("=")];
    })
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return null;

  // Reject timestamps older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || age > 300 || age < -30) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`)
  );
  const expected = [...new Uint8Array(signed)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (!timingSafeEqual(expected, v1)) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
