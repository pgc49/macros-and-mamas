/**
 * Web Push helpers for Home Screen installs.
 * iOS: open from the home-screen icon, then Allow on the system prompt.
 */

/** Public VAPID key (safe in client). Override with VITE_VAPID_PUBLIC_KEY. */
export const VAPID_PUBLIC_KEY =
  String(import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim()
  || "BHs-FqEp_tZjHd26ZsQxqAgt4-EQQxIazzqtggO0-gdlznw0O7QNKHJcdDOA_P_R13eesROYNFnlZyhXQRCZOMc";

export function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = window.navigator?.standalone === true;
  return !!(mq || iosStandalone);
}

export function pushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function registerMessageServiceWorker() {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.warn("service worker register failed", e);
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Request permission + store subscription in Supabase.
 * Must be called from a user gesture.
 */
export async function enablePushNotifications(saveSubscription) {
  if (!pushSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  if (!isStandaloneDisplay()) {
    return { ok: false, reason: "not_standalone" };
  }

  const reg = await registerMessageServiceWorker();
  if (!reg) return { ok: false, reason: "sw_failed" };

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  await saveSubscription?.({
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  });

  return { ok: true, permission };
}

export function notificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}
