import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

import { checkAiLimit, loadCoachSelf, loadSelf, pickCoachMacros, selfFromRows } from "./clientAiAccess.js";

describe("loadSelf keeps the fields the coach already stores", () => {
  it("keeps months postpartum, approved ranges, and Callie's notes", () => {
    const self = selfFromRows(
      {
        name: "QA",
        diet: "none",
        pref_d: "chicken",
        season_note: "nursing",
        allergens: ["dairy"],
        breastfeeding: true,
        months_pp: "4",
      },
      {
        cal: 1800,
        protein: 140,
        carbs: 160,
        fat: 55,
        notes: [" no oats ", "", "keep fat at the low end"],
      },
    );
    expect(self.profile.monthsPP).toBe(4);
    expect(self.profile.breastfeeding).toBe(true);
    expect(self.profile.prefD).toBe("chicken");
    expect(self.macros).toEqual({
      cal: 1800,
      protein: 140,
      carbs: 160,
      fat: 55,
      notes: ["no oats", "keep fat at the low end"],
    });
  });

  it("does not invent a stage or notes when the row has none", () => {
    const self = selfFromRows({ name: "QA", breastfeeding: false }, { cal: 1700, protein: 120, carbs: 150, fat: 50 });
    expect(self.profile.monthsPP).toBeNull();
    expect(self.macros.notes).toEqual([]);
  });
});

describe("loadSelf requires approved ranges", () => {
  it("drops a macros row that is not approved", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/rest/v1/profiles")) {
        return new Response(JSON.stringify([{ name: "QA", breastfeeding: false }]), { status: 200 });
      }
      if (String(url).includes("/rest/v1/macros")) {
        return new Response(JSON.stringify([{ cal: 1700, protein: 120, carbs: 150, fat: 50, approved: false }]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    const self = await loadSelf(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon" },
      "user-1",
      "Bearer token",
    );
    expect(self.profile.name).toBe("QA");
    expect(self.macros).toBeNull();
    vi.restoreAllMocks();
  });
});

describe("loadCoachSelf can work from a draft row", () => {
  it("keeps an unapproved macros row as working numbers", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/rest/v1/profiles")) {
        return new Response(JSON.stringify([{ name: "QA", breastfeeding: false }]), { status: 200 });
      }
      if (String(url).includes("/rest/v1/macros")) {
        return new Response(JSON.stringify([{ cal: 1700, protein: 120, carbs: 150, fat: 50, approved: false }]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    const self = await loadCoachSelf(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon" },
      "user-1",
      "Bearer token",
    );
    expect(self.macrosStatus).toBe("draft");
    expect(self.macros).toEqual({
      cal: 1700,
      protein: 120,
      carbs: 150,
      fat: 50,
      notes: [],
    });
    vi.restoreAllMocks();
  });

  it("reports none when there is no macros row", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/rest/v1/profiles")) {
        return new Response(JSON.stringify([{ name: "QA", breastfeeding: false }]), { status: 200 });
      }
      if (String(url).includes("/rest/v1/macros")) {
        return new Response("[]", { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    const self = await loadCoachSelf(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon" },
      "user-1",
      "Bearer token",
    );
    expect(self.macrosStatus).toBe("none");
    expect(self.macros).toBeNull();
    vi.restoreAllMocks();
  });

  it("still prefers an approved row when both exist", () => {
    expect(pickCoachMacros([
      { cal: 1600, approved: false },
      { cal: 1800, approved: true },
    ])).toEqual({ row: { cal: 1800, approved: true }, status: "approved" });
  });

  it("picks the newest unapproved row when several drafts exist", () => {
    expect(pickCoachMacros([
      { id: "old", cal: 1500, approved: false, created_at: "2026-10-01T00:00:00.000Z" },
      { id: "new", cal: 1700, approved: false, created_at: "2026-10-08T00:00:00.000Z" },
    ])).toEqual({
      row: { id: "new", cal: 1700, approved: false, created_at: "2026-10-08T00:00:00.000Z" },
      status: "draft",
    });
  });
});

describe("checkAiLimit reserves before the model", () => {
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service",
  };

  it("treats a reserved RPC ticket as spent when the cap is full", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("rpc/reserve_estimate_call")) {
        return new Response(JSON.stringify(false), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    const limit = await checkAiLimit(env, "user-1", {
      type: "coach",
      max: 30,
      spentMessage: "That's all for today.",
      busyMessage: "Try again.",
      requestId: "ask-1",
    });
    expect(limit).toEqual({ ok: false, reason: "spent", message: "That's all for today.", retryAfterSeconds: 86400 });
    expect(globalThis.fetch.mock.calls.filter(([url]) => String(url).includes("estimate_calls") && !String(url).includes("rpc"))).toHaveLength(0);
  });

  it("treats a fallback 409 on request_id as busy, not a reuse", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("rpc/reserve_estimate_call")) {
        return new Response("missing", { status: 404 });
      }
      if (String(url).includes("estimate_calls") && init?.method === "POST") {
        return new Response(null, { status: 409 });
      }
      return new Response("[]", { status: 200 });
    });
    const limit = await checkAiLimit(env, "user-1", {
      type: "coach",
      max: 30,
      spentMessage: "That's all for today.",
      busyMessage: "Try again.",
      requestId: "ask-1",
    });
    expect(limit).toEqual({ ok: false, reason: "outage", message: "Try again.", retryAfterSeconds: 60 });
  });
});
