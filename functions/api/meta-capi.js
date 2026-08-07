/* ==================================================================
   POST /api/meta-capi — browser → server Conversions API bridge
   ==================================================================
   Used for Lead (and optional browser-side Purchase) with shared event_id.
   Secrets: META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, META_CAPI_TEST_EVENT_CODE
   ================================================================== */

import {
  clientIpFromRequest,
  sendMetaCapiEvent,
} from "../_shared/metaCapi.js";

const ALLOWED = new Set(["Lead", "InitiateCheckout", "Purchase", "PageView"]);

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventName = String(body.event_name || "").trim();
    const eventId = String(body.event_id || "").trim();
    if (!ALLOWED.has(eventName) || !eventId) {
      return json({ ok: false, error: "invalid_event" }, 400);
    }

    const result = await sendMetaCapiEvent(env, {
      eventName,
      eventId,
      email: body.email,
      phone: body.phone,
      fbp: body.fbp,
      fbc: body.fbc,
      eventSourceUrl: body.event_source_url || request.headers.get("referer") || "",
      clientIp: clientIpFromRequest(request),
      clientUa: request.headers.get("user-agent") || "",
      customData: body.custom_data && typeof body.custom_data === "object" ? body.custom_data : undefined,
    });

    return json({ ok: Boolean(result.ok || result.skipped), ...result }, result.ok || result.skipped ? 200 : 502);
  } catch (e) {
    console.error("meta-capi bridge failed", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
