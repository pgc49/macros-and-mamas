import { describe, expect, it } from "vitest";
import {
  CONFIRM_FRESH_SIGNUP_WWW_HOST,
  CUSTOMER_PAGES_DEV_HOST,
  NAMED_CUSTOMER_PREVIEW_HOSTS,
  extraConfirmFreshSignupHosts,
  isConfirmFreshSignupAllowedHost,
  isNamedCustomerPreviewHost,
  originAllowed,
} from "./confirmFreshSignupOrigin.js";

function request({
  origin,
  url = "https://www.macrosandmamas.com/api/confirm-fresh-signup",
  host,
} = {}) {
  const headers = { "content-type": "application/json" };
  if (origin !== undefined) headers.origin = origin;
  if (host) headers.host = host;
  return new Request(url, { method: "POST", headers });
}

describe("confirm-fresh-signup allowlist", () => {
  it("names www and explicit customer preview hosts only", () => {
    expect(CONFIRM_FRESH_SIGNUP_WWW_HOST).toBe("www.macrosandmamas.com");
    expect(CUSTOMER_PAGES_DEV_HOST).toBe("macros-and-mamas.pages.dev");
    expect(NAMED_CUSTOMER_PREVIEW_HOSTS).toEqual([
      "macros-and-mamas.pages.dev",
      "preview.macros-and-mamas.pages.dev",
    ]);
    expect(NAMED_CUSTOMER_PREVIEW_HOSTS.some((host) => host.includes("*"))).toBe(false);
  });

  it("allows exact www and the named customer preview hosts", () => {
    expect(isConfirmFreshSignupAllowedHost("www.macrosandmamas.com", {})).toBe(true);
    expect(isConfirmFreshSignupAllowedHost("https://www.macrosandmamas.com", {})).toBe(true);
    expect(isConfirmFreshSignupAllowedHost("macros-and-mamas.pages.dev", {})).toBe(true);
    expect(isConfirmFreshSignupAllowedHost("preview.macros-and-mamas.pages.dev", {})).toBe(true);
  });

  it("rejects apex, localhost, and every pages.dev host that is not named", () => {
    expect(isConfirmFreshSignupAllowedHost("macrosandmamas.com", {})).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("localhost", {})).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("127.0.0.1", {})).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("evil.pages.dev", {})).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("attacker.pages.dev", {})).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("abc.macros-and-mamas.pages.dev", {})).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("deadbeef.macros-and-mamas.pages.dev", {})).toBe(false);
    expect(isNamedCustomerPreviewHost("abc.macros-and-mamas.pages.dev", {})).toBe(false);
  });

  it("never allows admin production or admin Pages previews", () => {
    expect(isConfirmFreshSignupAllowedHost("admin.macrosandmamas.com", {})).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("macros-and-mamas-admin.pages.dev", {})).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("deadbeef.macros-and-mamas-admin.pages.dev", {})).toBe(false);
    expect(isNamedCustomerPreviewHost("macros-and-mamas-admin.pages.dev", {})).toBe(false);
  });

  it("allows extra hosts only when they are explicit customer preview names", () => {
    const env = {
      CONFIRM_FRESH_SIGNUP_ALLOWED_HOSTS: "qa-join.macros-and-mamas.pages.dev, cursor-signup.macros-and-mamas.pages.dev",
    };
    expect(extraConfirmFreshSignupHosts(env)).toEqual([
      "qa-join.macros-and-mamas.pages.dev",
      "cursor-signup.macros-and-mamas.pages.dev",
    ]);
    expect(isConfirmFreshSignupAllowedHost("qa-join.macros-and-mamas.pages.dev", env)).toBe(true);
    expect(isConfirmFreshSignupAllowedHost("cursor-signup.macros-and-mamas.pages.dev", env)).toBe(true);
    expect(isConfirmFreshSignupAllowedHost("other.macros-and-mamas.pages.dev", env)).toBe(false);
  });

  it("ignores env extras that are not a single customer pages.dev label", () => {
    const env = {
      CONFIRM_FRESH_SIGNUP_ALLOWED_HOSTS: [
        "evil.pages.dev",
        "admin.macrosandmamas.com",
        "nested.preview.macros-and-mamas.pages.dev",
        "*.macros-and-mamas.pages.dev",
        "macros-and-mamas-admin.pages.dev",
      ].join(","),
    };
    expect(isConfirmFreshSignupAllowedHost("evil.pages.dev", env)).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("admin.macrosandmamas.com", env)).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("nested.preview.macros-and-mamas.pages.dev", env)).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("*.macros-and-mamas.pages.dev", env)).toBe(false);
    expect(isConfirmFreshSignupAllowedHost("macros-and-mamas-admin.pages.dev", env)).toBe(false);
  });
});

describe("originAllowed", () => {
  it("allows https www when Origin matches the request host", () => {
    expect(originAllowed(request({
      origin: "https://www.macrosandmamas.com",
    }), {})).toBe(true);
  });

  it("allows a named customer preview when Origin matches the request host", () => {
    expect(originAllowed(request({
      origin: "https://preview.macros-and-mamas.pages.dev",
      url: "https://preview.macros-and-mamas.pages.dev/api/confirm-fresh-signup",
    }), {})).toBe(true);
  });

  it("allows www with no Origin so same-host quiz/join still confirms", () => {
    expect(originAllowed(request({
      origin: "",
      url: "https://www.macrosandmamas.com/api/confirm-fresh-signup",
    }), {})).toBe(true);
  });

  it("rejects foreign pages.dev, localhost spoof, http www, and cross-host Origin", () => {
    expect(originAllowed(request({
      origin: "https://evil.pages.dev",
    }), {})).toBe(false);
    expect(originAllowed(request({
      origin: "http://localhost",
    }), {})).toBe(false);
    expect(originAllowed(request({
      origin: "http://www.macrosandmamas.com",
    }), {})).toBe(false);
    expect(originAllowed(request({
      origin: "https://preview.macros-and-mamas.pages.dev",
      url: "https://www.macrosandmamas.com/api/confirm-fresh-signup",
    }), {})).toBe(false);
    expect(originAllowed(request({
      origin: "https://www.macrosandmamas.com",
      url: "https://abc.macros-and-mamas.pages.dev/api/confirm-fresh-signup",
    }), {})).toBe(false);
  });

  it("keeps production admin and admin Pages previews forbidden", () => {
    expect(originAllowed(request({
      origin: "https://admin.macrosandmamas.com",
      url: "https://admin.macrosandmamas.com/api/confirm-fresh-signup",
    }), {})).toBe(false);
    expect(originAllowed(request({
      origin: "",
      url: "https://admin.macrosandmamas.com/api/confirm-fresh-signup",
      host: "admin.macrosandmamas.com",
    }), {})).toBe(false);
    expect(originAllowed(request({
      origin: "https://deadbeef.macros-and-mamas-admin.pages.dev",
      url: "https://deadbeef.macros-and-mamas-admin.pages.dev/api/confirm-fresh-signup",
    }), {})).toBe(false);
  });
});
