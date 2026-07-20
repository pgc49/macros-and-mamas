/* ==================================================================
   /functions/api/estimate.js — photo + text meal estimates (OpenRouter)
   ==================================================================
   Auth-gated. Secrets: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
   ================================================================== */

const VISION_MODEL = "google/gemini-3.1-flash-lite"; // vision-capable; same stack as /api/analyze
const TEXT_MODEL = "google/gemini-3.1-flash-lite";

const SPEC =
  'Respond with ONLY a JSON object, no markdown fences, no other text: {"meal":"short name","items":["item with portion"],"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":"low"|"medium"|"high","tip":"one warm, practical sentence a coach named Callie might say about this meal"} If the input is not food, return {"error":"not food"}.';

const MAX_BODY_CHARS = 2_500_000; // ~2MB guard on base64 payload

export async function onRequestPost({ request, env }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await requireSupabaseUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const access = await fetchEnrollment(env, user.id, authHeader);
    if (!access || access.refunded || (!access.paid && access.role !== "admin")) {
      return json({ error: "payment required" }, 403);
    }

    const rawLen = Number(request.headers.get("content-length") || 0);
    if (rawLen > MAX_BODY_CHARS) return json({ error: "payload too large" }, 413);

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: "invalid JSON body" }, 400);

    const { type, description, image_b64, media_type } = body;
    let model;
    let content;

    if (type === "photo") {
      if (!image_b64) return json({ error: "missing image_b64" }, 400);
      if (String(image_b64).length > MAX_BODY_CHARS) return json({ error: "image too large" }, 413);
      model = VISION_MODEL;
      content = [
        {
          type: "text",
          text: `You are a nutritionist's assistant estimating macros from a meal photo for a postpartum macro coaching program. Identify the foods and estimate portion sizes from visual cues (plate size, volume). ${SPEC}`,
        },
        {
          type: "image_url",
          image_url: { url: `data:${media_type || "image/jpeg"};base64,${image_b64}` },
        },
      ];
    } else if (type === "text") {
      if (!description?.trim()) return json({ error: "missing description" }, 400);
      model = TEXT_MODEL;
      content = `You are a nutritionist's assistant estimating macros for a postpartum macro coaching program. The client describes her meal as: "${description.trim().slice(0, 500)}". Estimate reasonable portions where unstated. ${SPEC}`;
    } else {
      return json({ error: "type must be 'photo' or 'text'" }, 400);
    }

    // Best-effort cost watch (ignore failures — table may not exist yet)
    logEstimateCall(env, user.id, type, authHeader).catch(() => {});

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "http-referer": "https://www.macrosandmamas.com",
        "x-title": "Macros and Mamas",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
      }),
    });

    const data = await resp.json().catch(() => null);
    if (!data) return json({ error: `upstream HTTP ${resp.status}` }, 502);
    if (data.error) return json({ error: data.error.message || String(data.error) }, 502);

    const text = data.choices?.[0]?.message?.content || "";
    if (!text) return json({ error: "empty model response" }, 502);

    const match = text.match(/\{[\s\S]*\}/);
    let parsed;
    try {
      parsed = JSON.parse(match ? match[0] : text);
    } catch {
      return json({ error: "unparseable model output", raw: text.slice(0, 200) }, 502);
    }

    return json(parsed, 200);
  } catch (e) {
    console.error("estimate failed", e);
    return json({ error: String(e?.message || e) }, 500);
  }
}

async function requireSupabaseUser(request, env) {
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

async function fetchEnrollment(env, userId, authHeader) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  if (!base || !anon || !userId || !authHeader) return null;

  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=paid,refunded,role`,
    {
      headers: {
        apikey: anon,
        authorization: authHeader,
      },
    }
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

async function logEstimateCall(env, userId, type, authHeader) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  if (!base || !anon || !userId || !authHeader) return;

  await fetch(`${base}/rest/v1/estimate_calls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anon,
      authorization: authHeader,
      prefer: "return=minimal",
    },
    body: JSON.stringify({ profile_id: userId, type }),
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
