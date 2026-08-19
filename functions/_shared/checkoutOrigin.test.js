import { describe, expect, it } from "vitest";
import { checkoutAppOrigin, checkoutRedirectUrls } from "./checkoutOrigin.js";

function request(url, host) {
  const headers = new Headers();
  if (host) headers.set("host", host);
  return new Request(url, { method: "POST", headers });
}

describe("checkoutAppOrigin", () => {
  it("keeps www / preview / localhost on their own origin", () => {
    expect(checkoutAppOrigin("https://www.macrosandmamas.com/api/checkout", {})).toBe(
      "https://www.macrosandmamas.com",
    );
    expect(checkoutAppOrigin("https://abc.macros-and-mamas.pages.dev/api/checkout", {})).toBe(
      "https://abc.macros-and-mamas.pages.dev",
    );
    expect(checkoutAppOrigin("http://localhost:8788/api/checkout", {})).toBe(
      "http://localhost:8788",
    );
  });

  it("sends admin host and admin Pages preview checkouts to www", () => {
    expect(checkoutAppOrigin(
      request("https://admin.macrosandmamas.com/api/checkout"),
      {},
    )).toBe("https://www.macrosandmamas.com");
    expect(checkoutAppOrigin(
      request("https://deadbeef.macros-and-mamas-admin.pages.dev/api/checkout"),
      {},
    )).toBe("https://www.macrosandmamas.com");
    expect(checkoutAppOrigin(
      request("https://macros-and-mamas-admin.pages.dev/api/checkout", "admin.macrosandmamas.com"),
      {},
    )).toBe("https://www.macrosandmamas.com");
  });
});

describe("checkoutRedirectUrls", () => {
  it("does not use the admin origin for success_url or cancel_url", () => {
    const urls = checkoutRedirectUrls(
      request("https://admin.macrosandmamas.com/api/checkout"),
      {},
    );
    expect(urls.success_url).toBe(
      "https://www.macrosandmamas.com/welcome?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(urls.cancel_url).toBe("https://www.macrosandmamas.com/join");
    expect(urls.eventSourceUrl).toBe("https://www.macrosandmamas.com/join");
    expect(urls.success_url).not.toContain("admin.macrosandmamas.com");
    expect(urls.cancel_url).not.toContain("admin.macrosandmamas.com");
  });

  it("leaves www checkout return URLs on www", () => {
    const urls = checkoutRedirectUrls(
      request("https://www.macrosandmamas.com/api/checkout"),
      {},
    );
    expect(urls.success_url).toBe(
      "https://www.macrosandmamas.com/welcome?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(urls.cancel_url).toBe("https://www.macrosandmamas.com/join");
  });
});
