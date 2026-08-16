import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADMIN_ORIGIN,
  adminOriginFromEnv,
  adminPortalUrl,
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
