import { describe, expect, it } from "vitest";
import { PATHS, homePathFor } from "./routing";

const enrolled = {
  approved: true,
  paid: true,
  macros: true,
  refunded: false,
};

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
