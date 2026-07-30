/* Service worker — web push + Home Screen icon badge (iOS 16.4+ / Android). */
/* v9 — title is sender name only (iOS already shows from Macros & Mamas) */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function applyAppBadge(unreadCount) {
  const n = Math.max(0, Math.floor(Number(unreadCount) || 0));
  try {
    if (n > 0 && self.navigator?.setAppBadge) {
      await self.navigator.setAppBadge(n);
    } else if (self.navigator?.clearAppBadge) {
      await self.navigator.clearAppBadge();
    }
  } catch (e) {
    console.warn("app badge update failed", e);
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SET_APP_BADGE") {
    event.waitUntil(applyAppBadge(event.data.unreadCount));
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Callie", body: "Open Messages", url: "/dashboard?tab=messages" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      data.body = event.data?.text() || data.body;
    } catch {
      /* keep defaults */
    }
  }

  const unreadCount = data.unreadCount != null ? Number(data.unreadCount) : 1;

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "Callie", {
        body: data.body || "Open Messages",
        icon: "/icon-192-v6.png",
        badge: "/icon-192-v6.png",
        data: { url: data.url || "/dashboard?tab=messages" },
      }),
      applyAppBadge(unreadCount > 0 ? unreadCount : 1),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data?.url || "/dashboard?tab=messages";
  const url = safeAppPath(raw);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});

/** Same-origin relative paths only — blocks javascript: / external open-redirects. */
function safeAppPath(url) {
  const fallback = "/dashboard?tab=messages";
  if (typeof url !== "string") return fallback;
  const trimmed = url.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://") || trimmed.toLowerCase().startsWith("javascript:")) return fallback;
  return trimmed.slice(0, 500) || fallback;
}
