import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOMER_ORIGIN,
  adminToCustomerRedirectUrl,
  customerEnrollmentUrl,
  customerOriginFromEnv,
  isCustomerEnrollmentPath,
} from "./customerOrigin.js";

describe("customerOriginFromEnv", () => {
  it("defaults to www", () => {
    expect(customerOriginFromEnv({})).toBe(DEFAULT_CUSTOMER_ORIGIN);
  });

  it("accepts https APP_URL / VITE_APP_URL", () => {
    expect(customerOriginFromEnv({ APP_URL: "https://www.example.com/" })).toBe(
      "https://www.example.com",
    );
    expect(customerOriginFromEnv({ VITE_APP_URL: "https://preview.macros-and-mamas.pages.dev" })).toBe(
      "https://preview.macros-and-mamas.pages.dev",
    );
  });

  it("rejects non-https and admin origins", () => {
    expect(customerOriginFromEnv({ APP_URL: "http://www.macrosandmamas.com" })).toBe(
      DEFAULT_CUSTOMER_ORIGIN,
    );
    expect(customerOriginFromEnv({ APP_URL: "https://admin.macrosandmamas.com" })).toBe(
      DEFAULT_CUSTOMER_ORIGIN,
    );
  });
});

describe("isCustomerEnrollmentPath", () => {
  it("treats /join, /welcome, and quiz handoff as enrollment", () => {
    expect(isCustomerEnrollmentPath("/join", "")).toBe(true);
    expect(isCustomerEnrollmentPath("/join/", "?ref=PATRICK25")).toBe(true);
    expect(isCustomerEnrollmentPath("/welcome", "?session_id=cs_123")).toBe(true);
    expect(isCustomerEnrollmentPath("/welcome/", "")).toBe(true);
    expect(isCustomerEnrollmentPath("/signin", "from=quiz&email=a@b.com")).toBe(true);
    expect(isCustomerEnrollmentPath("/signin/", "?from=quiz")).toBe(true);
  });

  it("leaves admin sign-in, reset-password, and /admin alone", () => {
    expect(isCustomerEnrollmentPath("/signin", "")).toBe(false);
    expect(isCustomerEnrollmentPath("/signin", "?auth=create")).toBe(false);
    expect(isCustomerEnrollmentPath("/reset-password", "")).toBe(false);
    expect(isCustomerEnrollmentPath("/admin", "?tab=messages")).toBe(false);
    expect(isCustomerEnrollmentPath("/", "")).toBe(false);
  });
});

describe("adminToCustomerRedirectUrl", () => {
  it("302s admin /join and checkout return to www with the same query", () => {
    expect(adminToCustomerRedirectUrl(
      "https://admin.macrosandmamas.com/join?from=quiz&email=a%40b.com",
      {},
    )).toBe("https://www.macrosandmamas.com/join?from=quiz&email=a%40b.com");
    expect(adminToCustomerRedirectUrl(
      "https://admin.macrosandmamas.com/welcome?session_id=cs_123",
      {},
    )).toBe("https://www.macrosandmamas.com/welcome?session_id=cs_123");
  });

  it("302s admin quiz handoff and admin Pages previews", () => {
    expect(adminToCustomerRedirectUrl(
      "https://admin.macrosandmamas.com/signin?from=quiz&auth=create",
      {},
    )).toBe("https://www.macrosandmamas.com/signin?from=quiz&auth=create");
    expect(adminToCustomerRedirectUrl(
      "https://deadbeef.macros-and-mamas-admin.pages.dev/join",
      {},
    )).toBe("https://www.macrosandmamas.com/join");
  });

  it("does not move www quiz/join/checkout or admin sign-in / reset /admin", () => {
    expect(adminToCustomerRedirectUrl("https://www.macrosandmamas.com/join?from=quiz", {})).toBeNull();
    expect(adminToCustomerRedirectUrl("https://www.macrosandmamas.com/signin?from=quiz", {})).toBeNull();
    expect(adminToCustomerRedirectUrl("https://www.macrosandmamas.com/welcome", {})).toBeNull();
    expect(adminToCustomerRedirectUrl("https://admin.macrosandmamas.com/signin", {})).toBeNull();
    expect(adminToCustomerRedirectUrl("https://admin.macrosandmamas.com/reset-password", {})).toBeNull();
    expect(adminToCustomerRedirectUrl("https://admin.macrosandmamas.com/admin", {})).toBeNull();
    expect(adminToCustomerRedirectUrl("https://preview.macros-and-mamas.pages.dev/join", {})).toBeNull();
  });

  it("builds an absolute customer enrollment URL", () => {
    expect(customerEnrollmentUrl("/join", "?from=quiz", "", DEFAULT_CUSTOMER_ORIGIN)).toBe(
      "https://www.macrosandmamas.com/join?from=quiz",
    );
  });
});
