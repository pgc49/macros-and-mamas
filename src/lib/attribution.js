/**
 * Capture Meta / UTM attribution from the landing URL and cookies.
 * Stored in sessionStorage so waitlist + checkout + profile stamp share ids.
 *
 * Cloudflare Web Analytics is separate (aggregate only) — it does NOT write
 * visitor rows here. anon_id is first-party localStorage, stitched to profiles
 * at signup / join (not for anonymous-only traffic in Supabase).
 */

import { supabase } from "./supabase";
import { CONFIG } from "../config";

const STORAGE_KEY = "mm_attribution_v1";
const ANON_KEY = "mm_anon_id";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

const PROFILE_ATTR_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "landing_path",
  "referrer_host",
  "anon_id",
];

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function buildFbc(fbclid) {
  if (!fbclid) return "";
  const existing = readCookie("_fbc");
  if (existing) return existing;
  return `fb.1.${Date.now()}.${fbclid}`;
}

/**
 * Stable first-party browser id (localStorage). Survives tab close; not CF WA.
 * Accepts mm_anon from marketing→www handoff query when localStorage is empty.
 */
export function getOrCreateAnonId(handoffAnon = "") {
  if (typeof localStorage === "undefined") return "";
  try {
    let id = (localStorage.getItem(ANON_KEY) || "").trim();
    if (id) return id.slice(0, 64);
    const fromHandoff = String(handoffAnon || "").trim().slice(0, 64);
    id = fromHandoff || newBrowserEventId("anon").slice(0, 64);
    localStorage.setItem(ANON_KEY, id);
    return id;
  } catch {
    return String(handoffAnon || "").trim().slice(0, 64);
  }
}

function referrerHost() {
  try {
    const raw = document.referrer || "";
    if (!raw) return "";
    return new URL(raw).hostname.slice(0, 200);
  } catch {
    return "";
  }
}

function mergeAttribution(prev, data) {
  const merged = { ...(prev || {}) };
  for (const [k, v] of Object.entries(data)) {
    if (v && !merged[k]) merged[k] = v;
  }
  return merged;
}

/**
 * Read current query params + cookies into sessionStorage.
 * First-touch: existing values win. Always ensures anon_id + landing_path.
 */
export function captureAttributionFromLocation(search = window.location.search) {
  const params = new URLSearchParams(search);
  const fbclid = (params.get("fbclid") || "").trim();
  const handoffAnon = (params.get("mm_anon") || "").trim();
  const handoffLanding = (params.get("mm_lp") || "").trim().slice(0, 200);
  const path =
    handoffLanding ||
    (typeof window !== "undefined"
      ? (window.location.pathname || "/").slice(0, 200)
      : "/");
  const data = {
    utm_source: (params.get("utm_source") || "").trim().slice(0, 120),
    utm_medium: (params.get("utm_medium") || "").trim().slice(0, 120),
    utm_campaign: (params.get("utm_campaign") || "").trim().slice(0, 120),
    utm_content: (params.get("utm_content") || "").trim().slice(0, 120),
    utm_term: (params.get("utm_term") || "").trim().slice(0, 120),
    fbclid: fbclid.slice(0, 200),
    fbp: readCookie("_fbp").slice(0, 128),
    fbc: (readCookie("_fbc") || buildFbc(fbclid)).slice(0, 128),
    landing_path: path,
    referrer_host: referrerHost(),
    anon_id: getOrCreateAnonId(handoffAnon),
    captured_at: new Date().toISOString(),
  };

  try {
    const prev = getStoredAttribution() || {};
    const merged = mergeAttribution(prev, data);
    // Always refresh anon_id if missing
    if (!merged.anon_id && data.anon_id) merged.anon_id = data.anon_id;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return data;
  }
}

export function getStoredAttribution() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function newBrowserEventId(prefix = "mm") {
  try {
    return `${prefix}_${crypto.randomUUID()}`;
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Fire browser Pixel event when fbq is loaded. */
export function trackPixel(eventName, params = {}, eventId) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  const payload = { ...params };
  if (eventId) payload.eventID = eventId;
  window.fbq("track", eventName, payload, eventId ? { eventID: eventId } : undefined);
}

/**
 * Re-init Pixel with email/name/phone so Meta can match the person
 * (the "data matching" step in Events Manager). Safe no-op without fbq.
 */
export function setPixelAdvancedMatching(user = {}) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  const pixelId = CONFIG.META_PIXEL_ID;
  if (!pixelId) return;
  const payload = {};
  const em = String(user.email || "").trim().toLowerCase();
  const fn = String(user.firstName || "").trim().toLowerCase();
  const ln = String(user.lastName || "").trim().toLowerCase();
  const ph = String(user.phone || "").replace(/\D/g, "");
  if (em) payload.em = em;
  if (fn) payload.fn = fn;
  if (ln) payload.ln = ln;
  if (ph.length >= 7) payload.ph = ph;
  if (!Object.keys(payload).length) return;
  window.fbq("init", pixelId, payload);
}

/**
 * Public marketing / enrollment routes only — not coaching tabs.
 * Used to decide whether to load Pixel / CF Web Analytics scripts.
 */
export function isPublicTrackingPath(pathname) {
  const p = String(pathname || "/").replace(/\/$/, "") || "/";
  return (
    p === "/" ||
    p === "/waitlist" ||
    p === "/quiz" ||
    p === "/thanks" ||
    p === "/join" ||
    p === "/welcome" ||
    p === "/signin" ||
    p === "/privacy" ||
    p === "/terms"
  );
}

/**
 * First-touch stamp of browser attribution onto profiles.
 * Only fills empty columns — never overwrites an earlier source.
 * No-op when signed out or nothing useful to write.
 */
export async function persistAttributionToProfile(userId) {
  if (!userId) return { wrote: false };
  captureAttributionFromLocation();
  const attr = getStoredAttribution() || {};
  const patch = {};
  for (const key of PROFILE_ATTR_KEYS) {
    const v = String(attr[key] || "").trim();
    if (v) patch[key] = v.slice(0, key === "anon_id" ? 64 : 200);
  }
  if (!Object.keys(patch).length) return { wrote: false };

  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select([...PROFILE_ATTR_KEYS, "attributed_at"].join(","))
    .eq("id", userId)
    .maybeSingle();
  if (readErr) {
    console.error("attribution read failed", readErr);
    return { wrote: false, error: readErr };
  }

  const update = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!existing?.[k]) update[k] = v;
  }
  if (!Object.keys(update).length) return { wrote: false, skipped: true };

  if (!existing?.attributed_at) {
    update.attributed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", userId);
  if (error) {
    console.error("attribution stamp failed", error);
    return { wrote: false, error };
  }
  return { wrote: true, fields: Object.keys(update) };
}
