/* ==================================================================
   /functions/api/admin-credits.js — admin credit ledger harness
   ==================================================================
   GET  ?email=... | ?userId=...  → ledger + balances
   POST { action: "grant"|"reverse", ... }
   Auth: Bearer Supabase JWT + profiles.role = admin
   ================================================================== */

import {
  findProfileByEmail,
  grantCredit,
  listLedgerForUser,
  reverseCredit,
  summarizeLedger,
  vestingDays,
} from "../_shared/credits.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

    const url = new URL(request.url);
    const userId = String(url.searchParams.get("userId") || "").trim();
    const email = String(url.searchParams.get("email") || "").trim();

    let profile = null;
    if (userId) {
      profile = await fetchProfile(env, userId);
    } else if (email) {
      profile = await findProfileByEmail(env, email);
    } else {
      return json({ error: "email or userId required" }, 400);
    }
    if (!profile) return json({ error: "user not found" }, 404);

    const rows = await listLedgerForUser(env, profile.id);
    const summary = summarizeLedger(rows);
    return json({
      profile: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        paid: profile.paid,
        stripeCustomerId: profile.stripe_customer_id || null,
      },
      availableCents: summary.availableCents,
      pendingCents: summary.pendingCents,
      vestingDays: vestingDays(env),
      rows,
    }, 200);
  } catch (e) {
    console.error("admin-credits get failed", e);
    return json({ error: "admin credits unavailable" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    if (action === "grant") {
      let userId = String(body.userId || "").trim();
      if (!userId && body.email) {
        const profile = await findProfileByEmail(env, body.email);
        if (!profile) return json({ error: "user not found" }, 404);
        userId = profile.id;
      }
      const amountCents = body.amountCents != null
        ? Number(body.amountCents)
        : Math.round(Number(body.amountDollars) * 100);
      const row = await grantCredit(env, {
        userId,
        amountCents,
        reason: body.reason || "manual",
        note: body.note,
        vestsAt: body.vestsAt || null,
      });
      return json({ ok: true, row }, 200);
    }

    if (action === "reverse") {
      const row = await reverseCredit(env, {
        ledgerId: body.ledgerId,
        note: body.note,
      });
      return json({ ok: true, row }, 200);
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("admin-credits post failed", e);
    const msg = String(e?.message || "admin credits failed");
    const status = /required|invalid|cannot|not found/i.test(msg) ? 400 : 500;
    return json({ error: msg }, status);
  }
}

async function fetchProfile(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,name,stripe_customer_id,paid,role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function isAdmin(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return false;
  const rows = await resp.json().catch(() => []);
  return rows[0]?.role === "admin";
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
