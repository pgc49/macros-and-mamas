import { beforeEach, describe, expect, it, vi } from "vitest";

const openrouter = vi.hoisted(() => ({
  callOpenRouter: vi.fn(),
  logAiFailure: vi.fn(),
  parseJsonLoose: vi.fn(),
  resolveModels: vi.fn(() => ["google/gemini-3.1-flash-lite"]),
}));

vi.mock("../_shared/openrouter.js", () => ({
  callOpenRouter: openrouter.callOpenRouter,
  logAiFailure: openrouter.logAiFailure,
  parseJsonLoose: openrouter.parseJsonLoose,
  resolveModels: openrouter.resolveModels,
}));

import { onRequestPost } from "./client-summary.js";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_ID = "00000000-0000-4000-8000-000000000010";

const env = {
  OPENROUTER_API_KEY: "or-key",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
};

function request(body, { token = "admin-token" } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("https://admin.macrosandmamas.com/api/client-summary", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function mockAuth({ role = "admin" } = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const value = String(url);
    if (value.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: ADMIN_ID }), { status: 200 });
    }
    if (value.includes("/rest/v1/profiles?id=eq.") && value.includes("select=role")) {
      return new Response(JSON.stringify([{ role }]), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  openrouter.callOpenRouter.mockResolvedValue({
    ok: true,
    text: '{"summary":"Quiet week.","suggested_touch":"Check in."}',
    model: "google/gemini-3.1-flash-lite",
  });
  openrouter.parseJsonLoose.mockReturnValue({
    ok: true,
    value: { summary: "Quiet week.", suggested_touch: "Check in." },
  });
});

describe("POST /api/client-summary", () => {
  it("rejects missing auth", async () => {
    const res = await onRequestPost({
      request: request({ clientId: CLIENT_ID, payload: { firstName: "Ava" } }, { token: "" }),
      env,
    });
    expect(res.status).toBe(401);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("rejects a non-admin", async () => {
    mockAuth({ role: "client" });
    const res = await onRequestPost({
      request: request({ clientId: CLIENT_ID, payload: { firstName: "Ava" } }),
      env,
    });
    expect(res.status).toBe(403);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("rejects a payload that includes DM bodies", async () => {
    mockAuth();
    const res = await onRequestPost({
      request: request({
        clientId: CLIENT_ID,
        payload: { firstName: "Ava", messages: [{ body: "hey mama" }] },
      }),
      env,
    });
    expect(res.status).toBe(400);
    expect(openrouter.callOpenRouter).not.toHaveBeenCalled();
  });

  it("returns a summary for a clean admin payload", async () => {
    mockAuth();
    const res = await onRequestPost({
      request: request({
        clientId: CLIENT_ID,
        payload: { firstName: "Ava", week: 3, meals: [] },
      }),
      env,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBe("Quiet week.");
    expect(data.suggested_touch).toBe("Check in.");
    expect(openrouter.callOpenRouter).toHaveBeenCalledTimes(1);
    expect(openrouter.callOpenRouter.mock.calls[0][0].label).toBe("client_summary");
    const system = openrouter.callOpenRouter.mock.calls[0][0].messages[0].content;
    expect(system).toMatch(/one client/);
    expect(system).not.toMatch(/one postpartum client/);
  });

  it("strips an invented postpartum line when her payload is not postpartum", async () => {
    mockAuth();
    openrouter.parseJsonLoose.mockReturnValue({
      ok: true,
      value: {
        summary: "This postpartum mama is logging well.",
        suggested_touch: "Ask how new-mom life is going.",
      },
    });
    const res = await onRequestPost({
      request: request({
        clientId: CLIENT_ID,
        payload: { firstName: "Dolly", breastfeeding: false, monthsPP: null, pregnant: false },
      }),
      env,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).not.toMatch(/postpartum/i);
    expect(data.suggested_touch).not.toMatch(/new-mom/i);
  });
});
