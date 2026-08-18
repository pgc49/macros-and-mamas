import { describe, expect, it, vi } from "vitest";
import {
  completeSignup,
  isExistingAccountError,
  signupLooksLikeExistingUser,
} from "./completeSignup";

describe("isExistingAccountError", () => {
  it("matches common Supabase already-registered copy", () => {
    expect(isExistingAccountError("User already registered")).toBe(true);
    expect(isExistingAccountError("A user with this email address has already been registered")).toBe(true);
    expect(isExistingAccountError("User already exists")).toBe(true);
    expect(isExistingAccountError("Invalid login credentials")).toBe(false);
  });
});

describe("signupLooksLikeExistingUser", () => {
  it("treats empty identities as an existing email", () => {
    expect(signupLooksLikeExistingUser({ user: { identities: [] } })).toBe(true);
    expect(signupLooksLikeExistingUser({ user: { identities: [{ id: "1" }] } })).toBe(false);
    expect(signupLooksLikeExistingUser({ user: { id: "1" } })).toBe(false);
    expect(signupLooksLikeExistingUser({ session: null })).toBe(false);
  });
});

describe("completeSignup", () => {
  it("is done when signup returns a session", async () => {
    const signIn = vi.fn();
    const result = await completeSignup({
      signUp: async () => ({ ok: true, session: { user: { id: "u1" } } }),
      signIn,
    });
    expect(result).toEqual({ ok: true });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in immediately when signup created the user without a session", async () => {
    const signIn = vi.fn(async () => ({ ok: true }));
    const result = await completeSignup({
      signUp: async () => ({ ok: true, session: null }),
      signIn,
    });
    expect(result).toEqual({ ok: true });
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("asks for email confirm only if that follow-up sign-in fails", async () => {
    const result = await completeSignup({
      signUp: async () => ({ ok: true, session: null }),
      signIn: async () => ({ ok: false, error: "Email not confirmed" }),
    });
    expect(result).toEqual({
      ok: false,
      needsEmailConfirm: true,
      error: "Email not confirmed",
    });
  });

  it("recovers when the email already exists and the password matches", async () => {
    const result = await completeSignup({
      signUp: async () => ({ ok: false, existingAccount: true, error: "User already registered" }),
      signIn: async () => ({ ok: true }),
    });
    expect(result).toEqual({ ok: true, recoveredExisting: true });
  });

  it("keeps the existing-account error when the password does not sign in", async () => {
    const result = await completeSignup({
      signUp: async () => ({ ok: false, existingAccount: true, error: "User already registered" }),
      signIn: async () => ({ ok: false, error: "Invalid login credentials" }),
    });
    expect(result).toEqual({
      ok: false,
      existingAccount: true,
      error: "Invalid login credentials",
    });
  });

  it("passes through other signup failures without signing in", async () => {
    const signIn = vi.fn();
    const result = await completeSignup({
      signUp: async () => ({ ok: false, error: "Password should be at least 6 characters" }),
      signIn,
    });
    expect(result).toEqual({ ok: false, error: "Password should be at least 6 characters" });
    expect(signIn).not.toHaveBeenCalled();
  });
});
