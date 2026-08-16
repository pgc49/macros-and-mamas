// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureGoogleTag,
  resetGoogleTagForTests,
  trackGoogle,
  trackGoogleFromMeta,
} from "./googleTag";

vi.mock("./attribution", () => ({
  isPublicTrackingPath: (pathname) => {
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
  },
}));

beforeEach(() => {
  resetGoogleTagForTests();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

afterEach(() => {
  resetGoogleTagForTests();
  vi.restoreAllMocks();
});

describe("ensureGoogleTag", () => {
  it("is a no-op without tag ids", () => {
    ensureGoogleTag("/join", { gtmId: "", gaId: "" });
    expect(document.getElementById("mm-gtag-js")).toBeNull();
    expect(document.getElementById("mm-gtm-js")).toBeNull();
  });

  it("does not inject on coaching routes", () => {
    ensureGoogleTag("/dashboard", { gtmId: "GTM-ABCDE1", gaId: "G-ABCDE12345" });
    expect(document.getElementById("mm-gtag-js")).toBeNull();
    expect(document.getElementById("mm-gtm-js")).toBeNull();
  });

  it("injects GA4 gtag on public routes", () => {
    ensureGoogleTag("/join", { gtmId: "", gaId: "G-ABCDE12345" });
    const script = document.getElementById("mm-gtag-js");
    expect(script).toBeTruthy();
    expect(script.src).toContain("G-ABCDE12345");
    expect(typeof window.gtag).toBe("function");
  });

  it("injects GTM on public routes", () => {
    ensureGoogleTag("/welcome", { gtmId: "GTM-ABCDE1", gaId: "" });
    const script = document.getElementById("mm-gtm-js");
    expect(script).toBeTruthy();
    expect(script.src).toContain("GTM-ABCDE1");
    expect(document.getElementById("mm-gtm-noscript")).toBeTruthy();
  });

  it("rejects malformed ids", () => {
    ensureGoogleTag("/join", { gtmId: "javascript:alert(1)", gaId: "<script>" });
    expect(document.getElementById("mm-gtag-js")).toBeNull();
    expect(document.getElementById("mm-gtm-js")).toBeNull();
  });
});

describe("trackGoogle", () => {
  it("pushes dataLayer and gtag events", () => {
    window.dataLayer = [];
    window.gtag = vi.fn();
    trackGoogle("generate_lead", { content_name: "ranges_quiz" });
    expect(window.dataLayer).toEqual([
      { event: "generate_lead", content_name: "ranges_quiz" },
    ]);
    expect(window.gtag).toHaveBeenCalledWith("event", "generate_lead", {
      content_name: "ranges_quiz",
    });
  });

  it("maps Meta Purchase onto GA4 purchase with transaction_id", () => {
    window.dataLayer = [];
    window.gtag = vi.fn();
    trackGoogleFromMeta("Purchase", { currency: "USD" }, "cs_123");
    expect(window.gtag).toHaveBeenCalledWith("event", "purchase", {
      currency: "USD",
      transaction_id: "cs_123",
      event_id: "cs_123",
    });
  });
});
