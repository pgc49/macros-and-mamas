/**
 * Signed unsubscribe links + suppression list for quiz / marketing mail.
 * Service-role writes; token is HMAC-SHA256 of the lowercase email.
 */

import { APP_URL } from "./emailLayout.mjs";

export const UNSUBSCRIBE_PREFIX = "quiz-unsub:v1:";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function unsubscribeSecret(env) {
  return String(
    env?.UNSUBSCRIBE_SECRET || env?.CRON_SECRET || env?.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

function hexFromBuffer(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length || left.length === 0) return false;
  let out = 0;
  for (let i = 0; i < left.length; i++) out |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return out === 0;
}

export async function signUnsubscribeToken(secret, email) {
  const keyMaterial = String(secret || "");
  const normalized = normalizeEmail(email);
  if (!keyMaterial || !normalized) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyMaterial),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${UNSUBSCRIBE_PREFIX}${normalized}`),
  );
  return hexFromBuffer(sig);
}

export async function verifyUnsubscribeToken(secret, email, token) {
  const expected = await signUnsubscribeToken(secret, email);
  return timingSafeEqualHex(expected, String(token || "").trim().toLowerCase());
}

export async function buildUnsubscribeUrl(env, email) {
  const normalized = normalizeEmail(email);
  const secret = unsubscribeSecret(env);
  if (!normalized || !secret) return "";
  const token = await signUnsubscribeToken(secret, normalized);
  if (!token) return "";
  const url = new URL("/api/unsubscribe", APP_URL);
  url.searchParams.set("e", normalized);
  url.searchParams.set("t", token);
  return url.toString();
}

export function listUnsubscribeHeaders(unsubscribeUrl) {
  if (!unsubscribeUrl) return {};
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Quiz / drip extras only. Never thread under the first ranges email. */
export function quizMailHeaders(unsubscribeUrl) {
  const headers = listUnsubscribeHeaders(unsubscribeUrl);
  for (const key of Object.keys(headers)) {
    if (/^in-reply-to$/i.test(key) || /^references$/i.test(key)) {
      delete headers[key];
    }
  }
  return headers;
}

async function supabaseRest(env) {
  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) return null;
  return { base, key };
}

/** True when this address opted out of quiz / marketing mail. Errors fail open (false). */
export async function isUnsubscribed(env, email) {
  const normalized = normalizeEmail(email);
  const rest = await supabaseRest(env);
  if (!normalized || !rest) return false;
  try {
    const resp = await fetch(
      `${rest.base}/rest/v1/email_unsubscribes?email=eq.${encodeURIComponent(normalized)}&select=email&limit=1`,
      { headers: { apikey: rest.key, authorization: `Bearer ${rest.key}` } },
    );
    if (!resp.ok) return false;
    const rows = await resp.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    console.warn("isUnsubscribed failed", e);
    return false;
  }
}

export async function recordUnsubscribe(env, email, source = "link") {
  const normalized = normalizeEmail(email);
  const rest = await supabaseRest(env);
  if (!normalized || !rest) return { ok: false, error: "missing config" };
  try {
    const resp = await fetch(
      `${rest.base}/rest/v1/email_unsubscribes?on_conflict=email`,
      {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: rest.key,
        authorization: `Bearer ${rest.key}`,
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        email: normalized,
        source: String(source || "link").slice(0, 40),
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error("email_unsubscribes upsert failed", resp.status, detail);
      return { ok: false, status: resp.status };
    }
    return { ok: true };
  } catch (e) {
    console.error("email_unsubscribes upsert error", e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Fail closed for drip sends: if the list cannot be read, skip mailing. */
export async function fetchUnsubscribedEmails(env) {
  const rest = await supabaseRest(env);
  if (!rest) return { ok: false, emails: new Set() };
  try {
    const resp = await fetch(
      `${rest.base}/rest/v1/email_unsubscribes?select=email`,
      { headers: { apikey: rest.key, authorization: `Bearer ${rest.key}` } },
    );
    if (!resp.ok) {
      console.error("email_unsubscribes fetch failed", resp.status, await resp.text());
      return { ok: false, emails: new Set() };
    }
    const rows = await resp.json().catch(() => []);
    const emails = new Set(
      (rows || []).map((r) => normalizeEmail(r.email)).filter(Boolean),
    );
    return { ok: true, emails };
  } catch (e) {
    console.error("email_unsubscribes fetch error", e);
    return { ok: false, emails: new Set() };
  }
}
