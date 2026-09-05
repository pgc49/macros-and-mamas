import { beforeEach, describe, expect, it, vi } from "vitest";

const openrouter = vi.hoisted(() => ({
  callOpenRouter: vi.fn(),
  logAiFailure: vi.fn(),
  messageForKind: vi.fn(() => "Try again in a minute."),
  parseJsonLoose: vi.fn(),
  resolveModels: vi.fn(() => ["google/gemini-3.1-flash-lite"]),
}));

vi.mock("../_shared/openrouter.js", () => openrouter);

import { onRequestPost } from "./coach.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";

const env = {
  OPENROUTER_API_KEY: "or-key",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
};

function request(body) {
  return new Request("https://app.macrosandmamas.com/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer mama-token" },
    body: JSON.stringify(body),
  });
}

function mockSupabase({ paid = true, role = "client", macros = true, callsUsed = 0 } = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const value = String(url);
    if (value.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: USER_ID }), { status: 200 });
    }
    if (value.includes("select=paid,refunded,role")) {
      return new Response(JSON.stringify([{ paid, refunded: false, role }]), { status: 200 });
    }
    if (value.includes("estimate_calls") && init?.method !== "POST") {
      return new Response("[]", {
        status: 200,
        headers: { "content-range": `0-0/${callsUsed}` },
      });
    }
    if (value.includes("estimate_calls")) return new Response(null, { status: 201 });
    if (value.includes("/rest/v1/profiles?id=eq.")) {
      return new Response(
        JSON.stringify([{ id: USER_ID, name: "Sam", diet: "none", allergens: [], pref_d: "chicken" }]),
        { status: 200 },
      );
    }
    if (value.includes("/rest/v1/macros")) {
      return new Response(
        JSON.stringify(macros ? [{ cal: 1750, protein: 140, carbs: 160, fat: 55 }] : []),
        { status: 200 },
      );
    }
    if (value.includes("custom_meals")) return new Response("[]", { status: 200 });
    return new Response("[]", { status: 200 });
  });
}

function modelReturns(value) {
  openrouter.callOpenRouter.mockResolvedValue({
    ok: true,
    text: JSON.stringify(value),
    model: "google/gemini-3.1-flash-lite",
  });
  openrouter.parseJsonLoose.mockReturnValue({ ok: true, value });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  modelReturns({ scope: "food", reply: "The chicken bowl fits and gets your protein in.", meals: [] });
});

describe("access", () => {
  it("refuses without a token", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: new Request("https://app.macrosandmamas.com/api/coach", {
        method: "POST",
        body: JSON.stringify({ mode: "ask", text: "what should I eat" }),
      }),
      env,
    });
    expect(resp.status).toBe(401);
  });

  it("refuses an unpaid mama", async () => {
    mockSupabase({ paid: false });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "what should I eat" }), env });
    expect(resp.status).toBe(403);
  });

  it("waits for Callie to approve her ranges", async () => {
    mockSupabase({ macros: false });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "what should I eat" }), env });
    expect(resp.status).toBe(409);
    expect((await resp.json()).error).toBe("macros_required");
  });
});

describe("the guardrail runs before the model", () => {
  it("hands a symptom to Callie without spending a call", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "I've been dizzy all day, what should I eat" }),
      env,
    });
    const data = await resp.json();
    expect(data.scope).toBe("urgent");
    expect(data.deflect).toBe("care");
    expect(data.meals).toEqual([]);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("hands range changes to Callie without spending a call", async () => {
    mockSupabase();
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "can you raise my calories" }), env });
    expect((await resp.json()).deflect).toBe("ranges");
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("answers a real meal question", async () => {
    mockSupabase();
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "what should I have for dinner" }), env });
    const data = await resp.json();
    expect(data.scope).toBe("food");
    expect(data.reply).toContain("chicken bowl");
    expect(openrouter.callOpenRouter).toHaveBeenCalledTimes(1);
  });

  it("still lets the model hand a question back", async () => {
    mockSupabase();
    modelReturns({ scope: "callie", reply: "", meals: [] });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "what should I eat before my run" }), env });
    const data = await resp.json();
    expect(data.scope).toBe("off_topic");
    expect(data.meals).toEqual([]);
  });

  it("answers the meal but flags the supply question", async () => {
    mockSupabase();
    const resp = await onRequestPost({
      request: request({ mode: "ask", text: "lunch ideas, will this affect my milk supply" }),
      env,
    });
    const data = await resp.json();
    expect(data.scope).toBe("food");
    expect(data.aside).toBe("supply");
  });
});

describe("what comes back", () => {
  it("drops a meal whose macros do not add up", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "Here you go.",
      meals: [
        { name: "Real bowl", cal: 430, p: 45, c: 30, f: 12, ingredients: [], steps: [] },
        { name: "Made up bowl", cal: 200, p: 60, c: 60, f: 30, ingredients: [], steps: [] },
      ],
    });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    const data = await resp.json();
    expect(data.meals).toHaveLength(1);
    expect(data.meals[0].name).toBe("Real bowl");
  });

  it("drops a reply that quotes her ranges back", async () => {
    mockSupabase();
    modelReturns({ scope: "food", reply: "Your ranges are 1750-1900 calories, so eat light.", meals: [] });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect((await resp.json()).reply).toBe("");
  });

  it("marks menu picks as estimates", async () => {
    mockSupabase();
    modelReturns({
      scope: "food",
      reply: "The grilled bowl is the one.",
      meals: [{ name: "Grilled chicken bowl", desc: "grilled chicken, rice, beans", cal: 520, p: 42, c: 55, f: 12, ingredients: [], steps: [] }],
    });
    const resp = await onRequestPost({
      request: request({
        mode: "menu",
        slot: "dinner",
        images: [{ image_b64: "abc", media_type: "image/jpeg" }],
      }),
      env,
    });
    const data = await resp.json();
    expect(data.mealSource).toBe("menu");
    expect(data.meals[0].desc).toMatch(/estimate/i);
  });

  it("needs a photo for a menu read", async () => {
    mockSupabase();
    const resp = await onRequestPost({ request: request({ mode: "menu", slot: "dinner" }), env });
    expect(resp.status).toBe(400);
  });
});

describe("cost", () => {
  it("stops her at the daily cap", async () => {
    mockSupabase({ callsUsed: 30 });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect(resp.status).toBe(429);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("does not cap Callie", async () => {
    mockSupabase({ role: "admin", callsUsed: 500 });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect(resp.status).toBe(200);
  });

  it("refuses rather than uncapping when the counter is unreadable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const value = String(url);
      if (value.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: USER_ID }), { status: 200 });
      if (value.includes("select=paid,refunded,role")) {
        return new Response(JSON.stringify([{ paid: true, refunded: false, role: "client" }]), { status: 200 });
      }
      if (value.includes("estimate_calls") && init?.method !== "POST") return new Response("boom", { status: 500 });
      return new Response("[]", { status: 200 });
    });
    const resp = await onRequestPost({ request: request({ mode: "ask", text: "dinner ideas" }), env });
    expect(resp.status).toBe(429);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });
});
