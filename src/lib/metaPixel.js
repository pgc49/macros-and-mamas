import { CONFIG } from "../config";
import {
  captureAttributionFromLocation,
  isPublicTrackingPath,
} from "./attribution";

let injected = false;

/**
 * Load Meta Pixel on public routes only. No-op without VITE_META_PIXEL_ID.
 * Call once from App root on route changes / mount.
 */
export function ensureMetaPixel(pathname = window.location.pathname) {
  captureAttributionFromLocation();

  const pixelId = CONFIG.META_PIXEL_ID;
  if (!pixelId) return;
  if (!isPublicTrackingPath(pathname)) return;
  if (injected || typeof window === "undefined") return;
  if (typeof window.fbq === "function") {
    injected = true;
    return;
  }

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
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
  injected = true;
}
