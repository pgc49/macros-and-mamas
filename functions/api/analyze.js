/* ==================================================================
   /functions/api/analyze.js — DEPRECATED legacy plate photo endpoint
   ==================================================================
   Kept so old clients get a clear error. Use /api/estimate (paid-gated).
   ================================================================== */

export async function onRequestPost() {
  return json(
    {
      error: "gone",
      message: "Use /api/estimate",
    },
    410
  );
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
