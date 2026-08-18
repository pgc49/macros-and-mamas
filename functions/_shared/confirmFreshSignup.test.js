import { describe, expect, it } from "vitest";
import {
  FRESH_SIGNUP_MS,
  shouldConfirmFreshUser,
  userFromAdminList,
} from "./confirmFreshSignup.js";

describe("shouldConfirmFreshUser", () => {
  const now = Date.parse("2026-08-18T00:00:00.000Z");

  it("confirms a brand-new unconfirmed user", () => {
    expect(shouldConfirmFreshUser({
      id: "u1",
      created_at: "2026-08-17T23:50:00.000Z",
      email_confirmed_at: null,
    }, now)).toBe(true);
  });

  it("leaves already-confirmed users alone", () => {
    expect(shouldConfirmFreshUser({
      id: "u1",
      created_at: "2026-08-17T23:50:00.000Z",
      email_confirmed_at: "2026-08-17T23:51:00.000Z",
    }, now)).toBe(false);
  });

  it("does not confirm stale unconfirmed accounts", () => {
    expect(shouldConfirmFreshUser({
      id: "u1",
      created_at: new Date(now - FRESH_SIGNUP_MS - 1).toISOString(),
      email_confirmed_at: null,
    }, now)).toBe(false);
  });

  it("rejects missing ids or dates", () => {
    expect(shouldConfirmFreshUser({ created_at: "2026-08-17T23:50:00.000Z" }, now)).toBe(false);
    expect(shouldConfirmFreshUser({ id: "u1" }, now)).toBe(false);
  });
});

describe("userFromAdminList", () => {
  it("matches the email case-insensitively", () => {
    const user = userFromAdminList({
      users: [
        { id: "a", email: "other@x.com" },
        { id: "b", email: "Mama@X.com" },
      ],
    }, "mama@x.com");
    expect(user?.id).toBe("b");
  });

  it("returns null when the email is absent", () => {
    expect(userFromAdminList({ users: [{ id: "a", email: "a@x.com" }] }, "b@x.com")).toBe(null);
    expect(userFromAdminList({}, "a@x.com")).toBe(null);
  });
});
