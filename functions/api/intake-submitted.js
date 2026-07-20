/* ==================================================================
   /functions/api/intake-submitted.js — email #4 + Callie B after intake
   ==================================================================
   Authed client calls this after a successful db.submitIntake.
   ================================================================== */

import { loadUserContact, sendIntakeEmails } from "../_shared/supabaseEmail.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    const contact = await loadUserContact(env, user.id);
    const profile = contact.profile || {};

    const stats = {
      age: body.age ?? profile.age ?? null,
      currentWeight: body.currentWeight ?? profile.current_weight ?? null,
      goalWeight: body.goalWeight ?? profile.goal_weight ?? null,
      breastfeeding: body.breastfeeding ?? profile.breastfeeding ?? null,
      monthsPP: body.monthsPP ?? profile.months_pp ?? null,
      phone: body.phone ?? profile.phone ?? null,
      tastes: body.tastes
        || [profile.pref_b, profile.pref_l, profile.pref_d].filter(Boolean).join(" · ")
        || null,
      seasonNote: body.seasonNote ?? profile.season_note ?? null,
    };

    await sendIntakeEmails(env, {
      email: contact.email || user.email,
      name: body.name || contact.name || profile.name,
      userId: user.id,
      stats,
    });

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("intake-submitted notify failed", e);
    return json({ error: "notify failed" }, 500);
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
