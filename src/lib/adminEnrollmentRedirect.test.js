import { describe, expect, it } from "vitest";
import { adminEnrollmentRedirectHref } from "./adminEnrollmentRedirect";

describe("adminEnrollmentRedirectHref", () => {
  it("sends admin /join, /welcome, and quiz handoff to www", () => {
    expect(adminEnrollmentRedirectHref({
      pathname: "/join",
      search: "?from=quiz&email=a%40b.com",
      hostname: "admin.macrosandmamas.com",
    })).toBe("https://www.macrosandmamas.com/join?from=quiz&email=a%40b.com");

    expect(adminEnrollmentRedirectHref({
      pathname: "/welcome",
      search: "?session_id=cs_123",
      hostname: "admin.macrosandmamas.com",
    })).toBe("https://www.macrosandmamas.com/welcome?session_id=cs_123");

    expect(adminEnrollmentRedirectHref({
      pathname: "/signin",
      search: "?from=quiz&auth=create",
      hostname: "abc.macros-and-mamas-admin.pages.dev",
    })).toBe("https://www.macrosandmamas.com/signin?from=quiz&auth=create");
  });

  it("redirects the compiled admin surface even on localhost", () => {
    expect(adminEnrollmentRedirectHref({
      pathname: "/join",
      search: "",
      hostname: "localhost",
      surface: "admin",
    })).toBe("https://www.macrosandmamas.com/join");
  });

  it("does not move www quiz/join/checkout or admin sign-in / reset /admin", () => {
    expect(adminEnrollmentRedirectHref({
      pathname: "/join",
      search: "?from=quiz",
      hostname: "www.macrosandmamas.com",
      surface: "customer",
    })).toBeNull();
    expect(adminEnrollmentRedirectHref({
      pathname: "/signin",
      search: "?from=quiz",
      hostname: "www.macrosandmamas.com",
      surface: "customer",
    })).toBeNull();
    expect(adminEnrollmentRedirectHref({
      pathname: "/welcome",
      hostname: "www.macrosandmamas.com",
      surface: "customer",
    })).toBeNull();
    expect(adminEnrollmentRedirectHref({
      pathname: "/signin",
      search: "?auth=create",
      hostname: "admin.macrosandmamas.com",
    })).toBeNull();
    expect(adminEnrollmentRedirectHref({
      pathname: "/reset-password",
      hostname: "admin.macrosandmamas.com",
    })).toBeNull();
    expect(adminEnrollmentRedirectHref({
      pathname: "/admin",
      hostname: "admin.macrosandmamas.com",
    })).toBeNull();
  });
});
