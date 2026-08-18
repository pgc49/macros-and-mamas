/* ==================================================================
   Meta Conversions API helper (Lead, InitiateCheckout, Purchase)
   ==================================================================
   Env:
     META_PIXEL_ID
     META_CAPI_ACCESS_TOKEN
     META_CAPI_TEST_EVENT_CODE (optional — Test Events)
   ================================================================== */

import { resolveMetaPixelId } from "./metaPixelId.js";

const GRAPH = "https://graph.facebook.com/v21.0";

export function metaConfigured(env) {
  return Boolean(resolveMetaPixelId(env) && env?.META_CAPI_ACCESS_TOKEN);
}

/** SHA-256 hex of an already-normalized string; empty → null (omit). */
export async function sha256Hex(value) {
  const v = String(value || "");
  if (!v) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex of trimmed lowercase string; empty input → null (omit). */
export async function sha256Normalized(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  return sha256Hex(v);
}

/** Meta city: lowercase letters only. */
export function normalizeCapiCity(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z]/g, "");
}

/** Meta zip: lowercase, drop +4 / suffix after hyphen. */
export function normalizeCapiZip(value) {
  return String(value || "").trim().toLowerCase().split("-")[0];
}

/**
 * Digits-only phone. Meta match quality needs a country code — 10-digit
 * US/NANP numbers get a leading 1 when country is US or unset.
 */
export function normalizePhoneDigits(phone, country) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 7) return "";
  const cc = String(country || "").trim().toLowerCase();
  const us = !cc || cc === "us" || cc === "usa";
  if (us && digits.length === 10) digits = `1${digits}`;
  return digits;
}

/** Digits-only phone, then hash. */
export async function hashPhone(phone, country) {
  const digits = normalizePhoneDigits(phone, country);
  if (!digits) return null;
  return sha256Normalized(digits);
}

/**
 * First / last for Meta `fn` / `ln`. Prefer an explicit last name;
 * otherwise split a full name. First name is the first token only
 * so a middle initial is not hashed as `fn`.
 */
export function splitPersonName(firstOrFull, lastName) {
  const last = String(lastName || "").trim();
  const raw = String(firstOrFull || "").trim();
  if (last) {
    return { firstName: raw.split(/\s+/)[0] || "", lastName: last };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { firstName: parts[0], lastName: parts[parts.length - 1] };
  }
  return { firstName: raw, lastName: "" };
}

/**
 * Name / phone / address for CAPI from the profile plus Stripe
 * `customer_details` (billing country + zip are usually present on card pay).
 */
export function matchFieldsFromProfileAndCheckout(contact = {}, session = {}) {
  const profile = contact.profile || {};
  const details = session.customer_details || {};
  const address = details.address || {};
  const { firstName, lastName } = splitPersonName(
    profile.name || details.name || "",
    profile.last_name || "",
  );
  return {
    email:
      contact.email
      || session.customer_email
      || details.email
      || "",
    phone: profile.phone || details.phone || "",
    firstName,
    lastName,
    city: address.city || "",
    state: address.state || "",
    zip: address.postal_code || "",
    country: address.country || "",
  };
}

/**
 * Hashed + unhashed user_data for one CAPI event. Blank fields omitted.
 */
export async function buildCapiUserData(opts = {}) {
  const emailHash = await sha256Normalized(opts.email);
  const phoneHash = await hashPhone(opts.phone, opts.country);
  const fnHash = await sha256Normalized(opts.firstName);
  const lnHash = await sha256Normalized(opts.lastName);
  const cityHash = await sha256Hex(normalizeCapiCity(opts.city));
  const stateHash = await sha256Normalized(opts.state);
  const zipHash = await sha256Hex(normalizeCapiZip(opts.zip));
  const countryHash = await sha256Normalized(opts.country);

  const userData = {};
  if (emailHash) userData.em = [emailHash];
  if (phoneHash) userData.ph = [phoneHash];
  if (fnHash) userData.fn = [fnHash];
  if (lnHash) userData.ln = [lnHash];
  if (cityHash) userData.ct = [cityHash];
  if (stateHash) userData.st = [stateHash];
  if (zipHash) userData.zp = [zipHash];
  if (countryHash) userData.country = [countryHash];
  if (opts.fbp) userData.fbp = String(opts.fbp).slice(0, 128);
  if (opts.fbc) userData.fbc = String(opts.fbc).slice(0, 128);
  if (opts.clientIp) userData.client_ip_address = String(opts.clientIp).slice(0, 64);
  if (opts.clientUa) userData.client_user_agent = String(opts.clientUa).slice(0, 512);
  return userData;
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
 * @param {string} [opts.firstName]
 * @param {string} [opts.lastName]
 * @param {string} [opts.city]
 * @param {string} [opts.state]
 * @param {string} [opts.zip]
 * @param {string} [opts.country]
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

  const userData = await buildCapiUserData(opts);

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

  const url = `${GRAPH}/${encodeURIComponent(resolveMetaPixelId(env))}/events?access_token=${encodeURIComponent(env.META_CAPI_ACCESS_TOKEN)}`;
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
