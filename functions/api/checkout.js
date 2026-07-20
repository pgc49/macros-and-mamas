/* ==================================================================
   /functions/api/checkout.js — Create a Stripe Checkout Session ($149)
   ==================================================================
   Secrets (Cloudflare Pages / .dev.vars — never commit real values):
     STRIPE_SECRET_KEY
     STRIPE_PRICE_ID
     SUPABASE_URL          (project URL; public)
   ================================================================== */

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

    const secret = env.STRIPE_SECRET_KEY;
    const priceId = env.STRIPE_PRICE_ID;
    if (!secret || !priceId) {
      console.error("missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID");
      return json({ error: "checkout unavailable" }, 503);
    }

    const origin = new URL(request.url).origin;
    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("success_url", `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`);
    body.set("cancel_url", `${origin}/join`);
    body.set("client_reference_id", user.id);
    body.set("customer_email", user.email || "");
    body.set("line_items[0][price]", priceId);
    body.set("line_items[0][quantity]", "1");
    body.set("metadata[supabase_user_id]", user.id);

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

    return json({ url: data.url, id: data.id }, 200);
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

  // Prefer service role; fall back to the caller's JWT under RLS.
  const apikey = service || anon;
  const authorization = service ? `Bearer ${service}` : authHeader;
  if (!apikey || !authorization) return null;

  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=paid,refunded`,
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
