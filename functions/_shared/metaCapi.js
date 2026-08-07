/* ==================================================================
   Meta Conversions API helper (Lead, InitiateCheckout, Purchase)
   ==================================================================
   Env:
     META_PIXEL_ID
     META_CAPI_ACCESS_TOKEN
     META_CAPI_TEST_EVENT_CODE (optional — Test Events)
   ================================================================== */

const GRAPH = "https://graph.facebook.com/v21.0";

export function metaConfigured(env) {
  return Boolean(env?.META_PIXEL_ID && env?.META_CAPI_ACCESS_TOKEN);
}

/** SHA-256 hex of normalized string; empty input → null (omit). */
export async function sha256Normalized(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Digits-only phone, then hash. */
export async function hashPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return sha256Normalized(digits);
}

/**
 * Send one CAPI event. Best-effort: never throws to callers who catch.
 * @param {object} env
 * @param {object} opts
 * @param {string} opts.eventName - Lead | InitiateCheckout | Purchase
 * @param {string} opts.eventId - shared with browser Pixel for dedupe
 * @param {string} [opts.eventSourceUrl]
 * @param {string} [opts.email]
 * @param {string} [opts.phone]
 * @param {string} [opts.fbp]
 * @param {string} [opts.fbc]
 * @param {string} [opts.clientIp]
 * @param {string} [opts.clientUa]
 * @param {object} [opts.customData] - value, currency, content_name, etc.
 */
export async function sendMetaCapiEvent(env, opts) {
  if (!metaConfigured(env)) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }

  const eventId = String(opts.eventId || "").trim();
  if (!eventId) {
    return { ok: false, skipped: true, reason: "missing_event_id" };
  }

  const emailHash = await sha256Normalized(opts.email);
  const phoneHash = await hashPhone(opts.phone);

  const userData = {};
  if (emailHash) userData.em = [emailHash];
  if (phoneHash) userData.ph = [phoneHash];
  if (opts.fbp) userData.fbp = String(opts.fbp).slice(0, 128);
  if (opts.fbc) userData.fbc = String(opts.fbc).slice(0, 128);
  if (opts.clientIp) userData.client_ip_address = String(opts.clientIp).slice(0, 64);
  if (opts.clientUa) userData.client_user_agent = String(opts.clientUa).slice(0, 512);

  const event = {
    event_name: opts.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "website",
    user_data: userData,
  };
  if (opts.eventSourceUrl) {
    event.event_source_url = String(opts.eventSourceUrl).slice(0, 1000);
  }
  if (opts.customData && typeof opts.customData === "object") {
    event.custom_data = opts.customData;
  }

  const body = {
    data: [event],
  };
  if (env.META_CAPI_TEST_EVENT_CODE) {
    body.test_event_code = String(env.META_CAPI_TEST_EVENT_CODE);
  }

  const url = `${GRAPH}/${encodeURIComponent(env.META_PIXEL_ID)}/events?access_token=${encodeURIComponent(env.META_CAPI_ACCESS_TOKEN)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("[meta-capi] error", opts.eventName, resp.status, data);
    return { ok: false, status: resp.status, data };
  }
  return { ok: true, data };
}

export function clientIpFromRequest(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

export function newEventId(prefix = "mm") {
  try {
    return `${prefix}_${crypto.randomUUID()}`;
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
