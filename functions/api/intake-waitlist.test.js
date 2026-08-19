import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./intake-waitlist.js";

function memoryKv() {
  const store = new Map();
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

function env(overrides = {}) {
  return {
    WAITLIST: memoryKv(),
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    ...overrides,
  };
}

function jsonRequest(body, headers = {}) {
  return new Request("https://www.macrosandmamas.com/api/intake-waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "cf-connecting-ip": "9.9.9.9",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const valid = {
  email: "hold@example.com",
  reason: "pregnant",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/intake-waitlist (public.waitlist)", () => {
  it("accepts a legit eligibility-hold signup via service role", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 201 }),
    );
    const res = await onRequestPost({
      request: jsonRequest(valid),
      env: env(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/rest/v1/waitlist");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer service");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      email: "hold@example.com",
      reason: "pregnant",
      months_pp: null,
      eligible_on: null,
      profile_id: null,
    });
  });

  it("computes eligible_on for early_nursing and ignores client profile_id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 201 }),
    );
    const res = await onRequestPost({
      request: jsonRequest({
        email: "nursing@example.com",
        reason: "early",
        months_pp: 1,
        profile_id: "client-supplied-id",
      }),
      env: env(),
    });
    expect(res.status).toBe(200);
    const row = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(row.reason).toBe("early_nursing");
    expect(row.months_pp).toBe(1);
    expect(row.profile_id).toBeNull();
    expect(row.eligible_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects an invalid reason without writing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await onRequestPost({
      request: jsonRequest({ email: "ok@example.com", reason: "dump" }),
      env: env(),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_reason" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate-limits after 8 hits from the same IP", async () => {
    const shared = env();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    for (let i = 0; i < 8; i += 1) {
      const res = await onRequestPost({ request: jsonRequest(valid), env: shared });
      expect(res.status).toBe(200);
    }
    const limited = await onRequestPost({ request: jsonRequest(valid), env: shared });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: "rate_limited" });
  });

  it("fails closed when WAITLIST KV is unbound", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await onRequestPost({
      request: jsonRequest(valid),
      env: env({ WAITLIST: undefined }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
