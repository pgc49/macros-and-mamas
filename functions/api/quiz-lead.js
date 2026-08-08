/* ==================================================================
   GET /api/quiz-lead — marketing_leads row for the signed-in email
   Used to prefill intake after quiz → pay. Service-role lookup.
   ================================================================== */

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user?.email) return json({ error: "unauthorized" }, 401);

    const email = String(user.email).trim().toLowerCase();
    const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!base || !key) return json({ error: "unavailable" }, 503);

    const url =
      `${base}/rest/v1/marketing_leads`
      + `?select=email,first_name,last_name,months_postpartum,feeding_status,height_in,current_weight_lbs,goal_weight_lbs,goal,activity_level,flags,segment,needs_review`
      + `&email=eq.${encodeURIComponent(email)}`
      + `&limit=1`;

    const resp = await fetch(url, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!resp.ok) {
      console.error("quiz-lead lookup failed", resp.status, await resp.text());
      return json({ error: "lookup failed" }, 502);
    }
    const rows = await resp.json().catch(() => []);
    const lead = Array.isArray(rows) ? rows[0] : null;
    if (!lead) return json({ lead: null }, 200);
    return json({ lead }, 200);
  } catch (e) {
    console.error("quiz-lead failed", e);
    return json({ error: "failed" }, 500);
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
