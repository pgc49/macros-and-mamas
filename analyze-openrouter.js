/* ==================================================================
   /functions/api/analyze.js — Cloudflare Pages Function (OpenRouter)
   ==================================================================
   Server-side proxy for the "Snap your plate" feature. All AI calls
   route through OpenRouter using an OpenAI-compatible request. The
   key lives ONLY as a Cloudflare secret and never ships to the
   client or the repo.

   PROD-TODO(secrets): set the secret before deploy —
     npx wrangler pages secret put OPENROUTER_API_KEY
   or Cloudflare dashboard: Pages project > Settings > Environment
   variables > add OPENROUTER_API_KEY (encrypted) for Production
   and Preview. NEVER commit the key or paste it into agent chats.

   MODEL: google/gemini-3.1-flash-lite — cheap multimodal, image
   input, fast. Fractions of a cent per plate photo. If food ID
   quality disappoints in testing, step up to google/gemini-3-flash
   or anthropic/claude-haiku-4.5 — one constant below.

   ABUSE NOTE: this endpoint is unauthenticated as written. Anyone
   who finds macrosandmamas.com/api/analyze can burn your OpenRouter
   budget. PROD-TODO(auth): once Supabase Auth exists, verify the
   Supabase JWT from the Authorization header here and add per-user
   rate limiting. Do not launch publicly without this.
   ================================================================== */

const MODEL = "google/gemini-3.1-flash-lite"; // the one knob for cost/quality

// Prompt preserved verbatim from the approved prototype.
const PROMPT =
  'You are a nutritionist\'s assistant estimating macros from a meal photo for a postpartum macro coaching program. Identify the foods and estimate portion sizes from visual cues (plate size, volume). Respond with ONLY a JSON object, no markdown fences, no other text: {"meal":"short name","items":["item with portion"],"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":"low"|"medium"|"high","tip":"one warm, practical sentence a coach named Callie might say about this plate"} If the image is not food, return {"error":"not food"}.';

export async function onRequestPost({ request, env }) {
  try {
    const { image, media_type } = await request.json();
    if (!image) {
      return json({ error: "missing image" }, 400);
    }

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`, // Cloudflare secret
        // Optional OpenRouter attribution headers (app rankings):
        "http-referer": "https://macrosandmamas.com",
        "x-title": "Macros and Mamas",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${media_type || "image/jpeg"};base64,${image}` },
            },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("openrouter error", resp.status, detail);
      return json({ error: "analysis unavailable" }, 502);
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return json(parsed, 200);
  } catch (e) {
    console.error("analyze failed", e);
    return json({ error: "analysis failed" }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
