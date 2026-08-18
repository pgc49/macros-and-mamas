/* ==================================================================
   /functions/api/admin-credits.js — admin Credits board + mama card
   ==================================================================
   GET  (no query or ?view=board)  → pending / available / referrals
   GET  ?email=... | ?userId=...   → one mama's ledger + balances
   POST { action: "grant"|"reverse", ... }
   Auth: Bearer Supabase JWT + profiles.role = admin
   ================================================================== */

import { buildCreditsBoard } from "../_shared/creditsBoard.js";
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
      const board = await loadCreditsBoard(env);
      return json({
        view: "board",
        vestingDays: vestingDays(env),
        ...board,
      }, 200);
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
      // Admin harness only grants manual credits (referrals/milestones land via stage 2+).
      const row = await grantCredit(env, {
        userId,
        amountCents,
        reason: "manual",
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

async function loadCreditsBoard(env) {
  const pendingRows = await sbGet(
    env,
    "/rest/v1/credit_ledger?status=eq.pending&amount_cents=gt.0&select=*&order=vests_at.asc&limit=200",
  );
  const availableRows = await sbGet(
    env,
    "/rest/v1/credit_ledger?status=eq.available&amount_cents=gt.0&select=*&order=created_at.desc&limit=200",
  );
  const ledgerRows = [...pendingRows, ...availableRows];

  let recentReferrals = [];
  try {
    recentReferrals = await sbGet(
      env,
      "/rest/v1/referrals?status=in.(paid,pending_payment)"
        + "&select=id,advocate_user_id,referred_user_id,code,status,credit_ledger_id,created_at"
        + "&order=created_at.desc&limit=50",
    );
  } catch (e) {
    console.error("admin-credits referrals list failed", e);
  }

  const referralIds = uniqueIds([
    ...ledgerRows.map((r) => r.related_referral_id),
    ...recentReferrals.map((r) => r.id),
  ]);
  let extraReferrals = [];
  if (referralIds.length) {
    try {
      extraReferrals = await sbGetIn(env, "referrals", referralIds,
        "id,advocate_user_id,referred_user_id,code,status,credit_ledger_id");
    } catch (e) {
      console.error("admin-credits referral lookup failed", e);
    }
  }

  const referralsById = {};
  for (const row of [...recentReferrals, ...extraReferrals]) {
    if (row?.id) referralsById[row.id] = row;
  }

  const userIds = uniqueIds([
    ...ledgerRows.map((r) => r.user_id),
    ...Object.values(referralsById).map((r) => r.advocate_user_id),
    ...Object.values(referralsById).map((r) => r.referred_user_id),
  ]);
  const profilesById = {};
  if (userIds.length) {
    const profiles = await sbGetIn(env, "profiles", userIds, "id,name,last_name");
    for (const p of profiles) {
      if (p?.id) profilesById[p.id] = p;
    }
  }

  let shareCodes = { paidWithCode: 0, paidWithoutCode: 0 };
  try {
    shareCodes = await loadShareCodeCounts(env);
  } catch (e) {
    console.error("admin-credits share-code counts failed", e);
  }

  return buildCreditsBoard({
    ledgerRows,
    profilesById,
    referralsById,
    recentReferrals,
    shareCodes,
  });
}

async function loadShareCodeCounts(env) {
  const paid = await sbGet(
    env,
    "/rest/v1/profiles?role=eq.client&paid=eq.true&refunded=eq.false&select=id&limit=1000",
  );
  const codes = await sbGet(env, "/rest/v1/referral_codes?select=user_id");
  const withCode = new Set(codes.map((r) => r.user_id).filter(Boolean));
  let paidWithCode = 0;
  let paidWithoutCode = 0;
  for (const p of paid) {
    if (withCode.has(p.id)) paidWithCode += 1;
    else paidWithoutCode += 1;
  }
  return { paidWithCode, paidWithoutCode };
}

function uniqueIds(values) {
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function sbGet(env, path) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) throw new Error("missing supabase config");
  const resp = await fetch(`${base}${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`supabase ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function sbGetIn(env, table, ids, select) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const filter = chunk.map((id) => encodeURIComponent(id)).join(",");
    const more = await sbGet(
      env,
      `/rest/v1/${table}?id=in.(${filter})&select=${select}`,
    );
    rows.push(...more);
  }
  return rows;
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
