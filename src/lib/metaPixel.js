import { CONFIG } from "../config";
import {
  captureAttributionFromLocation,
  isPublicTrackingPath,
} from "./attribution";

let injected = false;
let lastPageViewPath = "";

function normalizedPath(pathname) {
  return String(pathname || "/").replace(/\/$/, "") || "/";
}

function injectNoscript(pixelId) {
  if (typeof document === "undefined") return;
  if (document.getElementById("mm-meta-pixel-noscript")) return;
  const noscript = document.createElement("noscript");
  noscript.id = "mm-meta-pixel-noscript";
  const img = document.createElement("img");
  img.height = 1;
  img.width = 1;
  img.style.display = "none";
  img.alt = "";
  img.src = `https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`;
  noscript.appendChild(img);
  document.body?.insertBefore(noscript, document.body.firstChild);
}

/**
 * Load Meta Pixel on public routes only.
 * Call once from App root on route changes / mount.
 */
export function ensureMetaPixel(pathname = window.location.pathname) {
  captureAttributionFromLocation();

  if (import.meta.env.VITE_APP_SURFACE === "admin") return;

  const pixelId = CONFIG.META_PIXEL_ID;
  if (!pixelId) return;
  if (!isPublicTrackingPath(pathname)) return;
  if (typeof window === "undefined") return;

  const path = normalizedPath(pathname);

  if (!injected) {
    if (typeof window.fbq !== "function") {
      /* Standard Meta Pixel bootstrap */
      // eslint-disable-next-line no-unused-expressions
      !(function (f, b, e, v, n, t, s) {
        if (f.fbq) return;
        n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = "2.0";
        n.queue = [];
        t = b.createElement(e);
        t.async = true;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        if (s && s.parentNode) s.parentNode.insertBefore(t, s);
        else (b.head || b.documentElement).appendChild(t);
      })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

      window.fbq("init", pixelId);
      window.fbq("track", "PageView");
      injectNoscript(pixelId);
    }
    injected = true;
    lastPageViewPath = path;
    return;
  }

  if (path !== lastPageViewPath && typeof window.fbq === "function") {
    lastPageViewPath = path;
    window.fbq("track", "PageView");
  }
}

export function resetMetaPixelForTests() {
  injected = false;
  lastPageViewPath = "";
  if (typeof document !== "undefined") {
    document.getElementById("mm-meta-pixel-noscript")?.remove();
  }
  if (typeof window !== "undefined") {
    delete window.fbq;
    delete window._fbq;
  }
}
