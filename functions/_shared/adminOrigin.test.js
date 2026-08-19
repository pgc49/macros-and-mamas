import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADMIN_ORIGIN,
  adminOriginFromEnv,
  adminPortalUrl,
  isAdminSignupLockedHost,
} from "./adminOrigin.js";

describe("admin origin helpers", () => {
  it("defaults to the production admin host", () => {
    expect(adminOriginFromEnv({})).toBe(DEFAULT_ADMIN_ORIGIN);
    expect(adminPortalUrl({})).toBe("https://admin.macrosandmamas.com/admin");
  });

  it("accepts https ADMIN_APP_URL and VITE_ADMIN_APP_URL", () => {
    expect(adminPortalUrl({ ADMIN_APP_URL: "https://admin.example.com/" })).toBe(
      "https://admin.example.com/admin",
    );
    expect(adminPortalUrl({ VITE_ADMIN_APP_URL: "https://preview-admin.example.com" })).toBe(
      "https://preview-admin.example.com/admin",
    );
  });

  it("rejects non-https overrides", () => {
    expect(adminOriginFromEnv({ VITE_ADMIN_APP_URL: "http://evil.example" })).toBe(
      DEFAULT_ADMIN_ORIGIN,
    );
  });
});

describe("isAdminSignupLockedHost", () => {
  it("locks production admin and admin Pages preview hosts", () => {
    expect(isAdminSignupLockedHost("admin.macrosandmamas.com", {})).toBe(true);
    expect(isAdminSignupLockedHost("https://admin.macrosandmamas.com", {})).toBe(true);
    expect(isAdminSignupLockedHost("macros-and-mamas-admin.pages.dev", {})).toBe(true);
    expect(isAdminSignupLockedHost("deadbeef.macros-and-mamas-admin.pages.dev", {})).toBe(true);
  });

  it("locks a configured admin origin", () => {
    expect(isAdminSignupLockedHost("preview-admin.example.com", {
      VITE_ADMIN_APP_URL: "https://preview-admin.example.com",
    })).toBe(true);
  });

  it("does not lock www, apex, localhost, or customer Pages previews", () => {
    expect(isAdminSignupLockedHost("www.macrosandmamas.com", {})).toBe(false);
    expect(isAdminSignupLockedHost("macrosandmamas.com", {})).toBe(false);
    expect(isAdminSignupLockedHost("localhost", {})).toBe(false);
    expect(isAdminSignupLockedHost("abc.macros-and-mamas.pages.dev", {})).toBe(false);
  });
});
