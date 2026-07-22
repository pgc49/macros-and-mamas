/* ==================================================================
   /functions/api/refund.js — DISABLED (no self-serve auto-refunds)
   ==================================================================
   Previously issued Stripe refunds for pregnant / early nursing.
   Callie decides refunds 1:1 now. Clients hitting this get 403.
   ================================================================== */

export async function onRequestPost() {
  return json(
    {
      error: "contact coach for refund",
      message: "Auto-refunds are disabled. Callie will decide refunds personally.",
    },
    403,
  );
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
