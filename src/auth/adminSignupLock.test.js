import { describe, expect, it } from "vitest";
import {
  ADMIN_SIGNUP_DISABLED_MESSAGE,
  blockedAdminSignupResult,
  isAdminSignupLockedSurface,
} from "./adminSignupLock";

describe("isAdminSignupLockedSurface", () => {
  it("locks the compiled admin surface even on localhost", () => {
    expect(isAdminSignupLockedSurface({
      surface: "admin",
      hostname: "localhost",
    })).toBe(true);
  });

  it("locks the production admin host and admin Pages previews", () => {
    expect(isAdminSignupLockedSurface({
      surface: "customer",
      hostname: "admin.macrosandmamas.com",
    })).toBe(true);
    expect(isAdminSignupLockedSurface({
      surface: "combined",
      hostname: "abc123.macros-and-mamas-admin.pages.dev",
    })).toBe(true);
  });

  it("leaves www / quiz / join create-account unlocked", () => {
    expect(isAdminSignupLockedSurface({
      surface: "customer",
      hostname: "www.macrosandmamas.com",
    })).toBe(false);
    expect(isAdminSignupLockedSurface({
      surface: "combined",
      hostname: "macrosandmamas.com",
    })).toBe(false);
    expect(isAdminSignupLockedSurface({
      surface: "customer",
      hostname: "preview.macros-and-mamas.pages.dev",
    })).toBe(false);
    expect(isAdminSignupLockedSurface({
      surface: "combined",
      hostname: "localhost",
    })).toBe(false);
  });
});

describe("signup helpers", () => {
  it("return a blocked signUpWithPassword result on the admin host", () => {
    expect(isAdminSignupLockedSurface({
      surface: "admin",
      hostname: "admin.macrosandmamas.com",
    })).toBe(true);
    expect(blockedAdminSignupResult()).toEqual({
      error: { message: ADMIN_SIGNUP_DISABLED_MESSAGE },
      needsEmailConfirm: false,
    });
  });
});
