import { describe, expect, it } from "vitest";
import { PATHS, adminPortalHref, canonicalPath, homePathFor, isExternalAdminHref } from "./routing";

const enrolled = {
  approved: true,
  paid: true,
  macros: true,
  refunded: false,
};

describe("canonicalPath", () => {
  it("strips Cloudflare pretty-URL trailing slashes", () => {
    expect(canonicalPath("/signin/")).toBe("/signin");
    expect(canonicalPath("/join/")).toBe("/join");
    expect(canonicalPath("/")).toBe("/");
    expect(canonicalPath("/signin")).toBe("/signin");
  });
});

describe("homePathFor", () => {
  it("sends admins to the coach portal on admin and combined surfaces", () => {
    expect(homePathFor({ isAdmin: true, ...enrolled, surface: "admin" })).toBe(PATHS.admin);
    expect(homePathFor({ isAdmin: true, ...enrolled, surface: "combined" })).toBe(PATHS.admin);
  });

  it("keeps admins in the mama app on the customer/www surface", () => {
    expect(homePathFor({ isAdmin: true, ...enrolled, surface: "customer" })).toBe(PATHS.dashboard);
  });

  it("still sends mamas to dashboard when enrolled", () => {
    expect(homePathFor({ isAdmin: false, ...enrolled, surface: "customer" })).toBe(PATHS.dashboard);
  });
});

describe("adminPortalHref", () => {
  it("stays same-origin on admin and combined surfaces", () => {
    expect(adminPortalHref({ surface: "admin" })).toBe(PATHS.admin);
    expect(adminPortalHref({ surface: "combined" })).toBe(PATHS.admin);
    expect(isExternalAdminHref("admin")).toBe(false);
    expect(isExternalAdminHref("combined")).toBe(false);
  });

  it("sends www coaches to the isolated admin origin", () => {
    expect(adminPortalHref({ surface: "customer" })).toBe(
      "https://admin.macrosandmamas.com/admin",
    );
    expect(isExternalAdminHref("customer")).toBe(true);
  });
});
