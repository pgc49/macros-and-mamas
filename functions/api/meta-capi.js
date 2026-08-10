/* ==================================================================
   POST /api/meta-capi — browser → server Conversions API bridge
   ==================================================================
   Hardened: allowlisted events (no public Purchase), same-origin check,
   KV rate limit (fail-closed), field caps. Purchase stays webhook-only.
   Secrets: META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, META_CAPI_TEST_EVENT_CODE
   Binding: WAITLIST KV (required for rate limit)
   ================================================================== */

import {
  clientIpFromRequest,
  sendMetaCapiEvent,
} from "../_shared/metaCapi.js";

/** Browser bridge only — Purchase is webhook-only (stripe-webhook.js). */
const ALLOWED = new Set(["Lead", "InitiateCheckout", "PageView"]);
const ALLOWED_HOSTS = new Set([
  "www.macrosandmamas.com",
  "macrosandmamas.com",
  "localhost",
  "127.0.0.1",
]);
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
const CUSTOM_DATA_KEYS = new Set([
  "value",
  "currency",
  "content_name",
  "content_type",
  "content_ids",
  "num_items",
]);

export async function onRequestPost({ request, env }) {
  try {
    if (!(await originAllowed(request))) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const ip = clientIpFromRequest(request) || "unknown";
    const limited = await rateLimited(env, ip);
    if (limited === "unavailable") {
      console.error("meta-capi rate limit unavailable (WAITLIST KV unbound)");
      return json({ ok: false, error: "unavailable" }, 503);
    }
    if (limited) {
      return json({ ok: false, error: "rate_limited" }, 429);
    }

    const body = await request.json().catch(() => ({}));
    const eventName = String(body.event_name || "").trim();
    const eventId = String(body.event_id || "").trim().slice(0, 128);
    if (!ALLOWED.has(eventName) || !eventId) {
      return json({ ok: false, error: "invalid_event" }, 400);
    }

    const result = await sendMetaCapiEvent(env, {
      eventName,
      eventId,
      email: String(body.email || "").slice(0, 254),
      phone: String(body.phone || "").slice(0, 32),
      fbp: String(body.fbp || "").slice(0, 128),
      fbc: String(body.fbc || "").slice(0, 128),
      eventSourceUrl: sanitizeEventSourceUrl(
        body.event_source_url || request.headers.get("referer") || "",
      ),
      clientIp: ip === "unknown" ? "" : ip,
      clientUa: (request.headers.get("user-agent") || "").slice(0, 512),
      customData: sanitizeCustomData(body.custom_data),
    });

    return json({ ok: Boolean(result.ok || result.skipped), ...result }, result.ok || result.skipped ? 200 : 502);
  } catch (e) {
    console.error("meta-capi bridge failed", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
}

async function originAllowed(request) {
  const origin = request.headers.get("origin") || "";
  const referer = request.headers.get("referer") || "";
  const candidate = origin || referer;
  if (!candidate) return false;
  try {
    const host = new URL(candidate).hostname.toLowerCase();
    if (ALLOWED_HOSTS.has(host)) return true;
    // Cloudflare Pages preview deploys (*.pages.dev)
    if (host.endsWith(".macros-and-mamas.pages.dev") || host.endsWith(".pages.dev")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** @returns {Promise<boolean|"unavailable">} true = limited */
async function rateLimited(env, ip) {
  if (!env.WAITLIST) return "unavailable";
  const key = `meta-capi-rl:${ip}`;
  const raw = await env.WAITLIST.get(key);
  const now = Date.now();
  let hits = [];
  if (raw) {
    try {
      hits = JSON.parse(raw).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    } catch {
      hits = [];
    }
  }
  if (hits.length >= RATE_LIMIT_MAX) return true;
  hits.push(now);
  await env.WAITLIST.put(key, JSON.stringify(hits), {
    expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  });
  return false;
}

function sanitizeEventSourceUrl(raw) {
  const s = String(raw || "").slice(0, 1000);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())
      && !u.hostname.toLowerCase().endsWith(".pages.dev")) {
      return "";
    }
    return u.toString().slice(0, 1000);
  } catch {
    return "";
  }
}

function sanitizeCustomData(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out = {};
  for (const key of CUSTOM_DATA_KEYS) {
    if (!(key in raw)) continue;
    const v = raw[key];
    if (typeof v === "string") out[key] = v.slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (Array.isArray(v)) out[key] = v.slice(0, 20).map((x) => String(x).slice(0, 64));
  }
  return Object.keys(out).length ? out : undefined;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
