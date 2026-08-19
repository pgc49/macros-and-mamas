import { describe, expect, it } from "vitest";
import { confirmEmailRedirectTo, resetPasswordRedirectTo } from "./authRedirects";

describe("confirmEmailRedirectTo", () => {
  it("sends confirm-email off the admin origin to www", () => {
    expect(confirmEmailRedirectTo({
      origin: "https://admin.macrosandmamas.com",
      hostname: "admin.macrosandmamas.com",
    })).toBe("https://www.macrosandmamas.com");
    expect(confirmEmailRedirectTo({
      origin: "https://deadbeef.macros-and-mamas-admin.pages.dev",
      hostname: "deadbeef.macros-and-mamas-admin.pages.dev",
    })).toBe("https://www.macrosandmamas.com");
    expect(confirmEmailRedirectTo({
      origin: "http://localhost:5173",
      hostname: "localhost",
      surface: "admin",
    })).toBe("https://www.macrosandmamas.com");
  });

  it("leaves www / quiz confirm-email on the customer origin", () => {
    expect(confirmEmailRedirectTo({
      origin: "https://www.macrosandmamas.com",
      hostname: "www.macrosandmamas.com",
      surface: "customer",
    })).toBe("https://www.macrosandmamas.com");
    expect(confirmEmailRedirectTo({
      origin: "https://preview.macros-and-mamas.pages.dev",
      hostname: "preview.macros-and-mamas.pages.dev",
      surface: "customer",
    })).toBe("https://preview.macros-and-mamas.pages.dev");
  });
});

describe("resetPasswordRedirectTo", () => {
  it("keeps forgot-password / recovery on the current origin including admin", () => {
    expect(resetPasswordRedirectTo({
      origin: "https://admin.macrosandmamas.com",
    })).toBe("https://admin.macrosandmamas.com/reset-password");
    expect(resetPasswordRedirectTo({
      origin: "https://www.macrosandmamas.com",
    })).toBe("https://www.macrosandmamas.com/reset-password");
  });
});
