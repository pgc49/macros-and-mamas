// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureMetaPixel, resetMetaPixelForTests } from "./metaPixel";

vi.mock("../config", () => ({
  CONFIG: { META_PIXEL_ID: "1078367721716098" },
}));

vi.mock("./attribution", () => ({
  captureAttributionFromLocation: () => {},
  isPublicTrackingPath: (pathname) => {
    const p = String(pathname || "/").replace(/\/$/, "") || "/";
    return p === "/join" || p === "/welcome";
  },
}));

beforeEach(() => {
  resetMetaPixelForTests();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

afterEach(() => {
  resetMetaPixelForTests();
  vi.restoreAllMocks();
});

describe("ensureMetaPixel", () => {
  it("does not inject on coaching routes", () => {
    ensureMetaPixel("/dashboard");
    expect(typeof window.fbq).not.toBe("function");
  });

  it("inits the live pixel and fires PageView on public routes", () => {
    ensureMetaPixel("/join");
    expect(typeof window.fbq).toBe("function");
    expect(window.fbq.queue || window._fbq).toBeTruthy();
    const src = [...document.scripts].map((s) => s.src).join(" ");
    expect(src).toContain("fbevents.js");
  });

  it("fires another PageView when the public route changes", () => {
    ensureMetaPixel("/join");
    const fbq = vi.fn();
    window.fbq = fbq;
    ensureMetaPixel("/welcome");
    expect(fbq).toHaveBeenCalledWith("track", "PageView");
  });
});
