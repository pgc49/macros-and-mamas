/**
 * Capture Meta / UTM attribution from the landing URL and cookies.
 * Stored in sessionStorage so waitlist + checkout can attach the same ids.
 */

const STORAGE_KEY = "mm_attribution_v1";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

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

/** Read current query params + cookies into a plain object. */
export function captureAttributionFromLocation(search = window.location.search) {
  const params = new URLSearchParams(search);
  const fbclid = (params.get("fbclid") || "").trim();
  const data = {
    utm_source: (params.get("utm_source") || "").trim().slice(0, 120),
    utm_medium: (params.get("utm_medium") || "").trim().slice(0, 120),
    utm_campaign: (params.get("utm_campaign") || "").trim().slice(0, 120),
    utm_content: (params.get("utm_content") || "").trim().slice(0, 120),
    utm_term: (params.get("utm_term") || "").trim().slice(0, 120),
    fbclid: fbclid.slice(0, 200),
    fbp: readCookie("_fbp").slice(0, 128),
    fbc: (readCookie("_fbc") || buildFbc(fbclid)).slice(0, 128),
    captured_at: new Date().toISOString(),
  };
  const hasAny =
    UTM_KEYS.some((k) => data[k]) || data.fbclid || data.fbp || data.fbc;
  if (!hasAny) return getStoredAttribution();
  try {
    const prev = getStoredAttribution() || {};
    const merged = { ...prev };
    for (const [k, v] of Object.entries(data)) {
      if (v) merged[k] = v;
    }
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
 * Public marketing / enrollment routes only — not coaching tabs.
 * Used to decide whether to load the Pixel script.
 */
export function isPublicTrackingPath(pathname) {
  const p = String(pathname || "/").replace(/\/$/, "") || "/";
  return (
    p === "/" ||
    p === "/waitlist" ||
    p === "/join" ||
    p === "/welcome" ||
    p === "/signin" ||
    p === "/privacy" ||
    p === "/terms"
  );
}
