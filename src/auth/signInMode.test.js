import { describe, expect, it } from "vitest";
import { PATHS } from "../routing";
import { nextAuthSwitch, resolveSignInMode } from "./signInMode";

describe("resolveSignInMode", () => {
  it("keeps www /signin?auth=create on create while enrollment is open", () => {
    expect(resolveSignInMode({
      authMode: "signin",
      search: "?auth=create",
      enrollmentOpen: true,
    })).toBe("create");
  });

  it("uses first-visit intake create on www when the URL does not override", () => {
    expect(resolveSignInMode({
      authMode: "create",
      search: "",
      enrollmentOpen: true,
    })).toBe("create");
  });

  it("cannot flip the admin host to create via ?auth=create or intake default", () => {
    expect(resolveSignInMode({
      authMode: "create",
      search: "?auth=create",
      enrollmentOpen: true,
      signupLocked: true,
    })).toBe("signin");
    expect(resolveSignInMode({
      authMode: "create",
      search: "",
      from: PATHS.join,
      enrollmentOpen: true,
      signupLocked: true,
    })).toBe("signin");
  });

  it("still honors explicit sign-in on www", () => {
    expect(resolveSignInMode({
      authMode: "create",
      search: "?auth=signin",
      enrollmentOpen: true,
    })).toBe("signin");
  });
});

describe("nextAuthSwitch", () => {
  it("lets www visitors switch to create", () => {
    expect(nextAuthSwitch("create")).toBe("create");
    expect(nextAuthSwitch("signin")).toBe("signin");
  });

  it("refuses a create switch on the admin host", () => {
    expect(nextAuthSwitch("create", { signupLocked: true })).toBeNull();
    expect(nextAuthSwitch("signin", { signupLocked: true })).toBe("signin");
  });
});
