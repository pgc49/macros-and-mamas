import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { evalTokenEmailAllowed, verifyCoachEvalToken } from "./coachEvalGuard.js";

describe("coach eval token email", () => {
  it("only allows the labeled QA plus-address shape", () => {
    expect(evalTokenEmailAllowed("pgchammas+qa-active@gmail.com")).toBe(true);
    expect(evalTokenEmailAllowed("pgchammas+qa-setup-b@gmail.com")).toBe(true);
    expect(evalTokenEmailAllowed("pgchammas@gmail.com")).toBe(false);
    expect(evalTokenEmailAllowed("pgchammas+other@gmail.com")).toBe(false);
    expect(evalTokenEmailAllowed("someone+qa-active@gmail.com")).toBe(false);
  });

  it("checks the token at /auth/v1/user regardless of --account", async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(String(url)).toBe("https://example.supabase.co/auth/v1/user");
      return new Response(JSON.stringify({ email: "pgchammas+qa-active@gmail.com" }), { status: 200 });
    });
    const ok = await verifyCoachEvalToken({
      token: "jwt",
      supabaseUrl: "https://example.supabase.co",
      fetchImpl,
    });
    expect(ok).toEqual({ ok: true, email: "pgchammas+qa-active@gmail.com" });

    const refused = await verifyCoachEvalToken({
      token: "jwt",
      supabaseUrl: "https://example.supabase.co",
      fetchImpl: async () => new Response(JSON.stringify({ email: "pgchammas@gmail.com" }), { status: 200 }),
    });
    expect(refused).toEqual({ ok: false, reason: "email", email: "pgchammas@gmail.com" });
  });

  it("skips questions 41, 51, and 52 unless --include-careful, and checks the token", () => {
    const src = readFileSync(new URL("./coach-eval.mjs", import.meta.url), "utf8");
    expect(src).toMatch(/verifyCoachEvalToken/);
    expect(src).toMatch(/evalTokenEmailAllowed\(verified\.email\)/);
    expect(src).toMatch(/row\.id !== 41 && row\.id !== 51 && row\.id !== 52/);
    expect(src).not.toMatch(/account\.includes\("qa-"\)/);
  });
});
