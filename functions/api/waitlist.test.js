import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./waitlist.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

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
  return new Request("https://www.macrosandmamas.com/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "cf-connecting-ip": "1.2.3.4",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const valid = {
  email: "mama@example.com",
  first_name: "Jane",
  last_name: "Doe",
  phone: "5551234567",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/waitlist (cohort_waitlist)", () => {
  it("accepts a legit cohort waitlist signup via service role", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 201 }),
    );
    const res = await onRequestPost({
      request: jsonRequest(valid),
      env: env(),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/rest/v1/cohort_waitlist");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer service");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      email: "mama@example.com",
      first_name: "Jane",
      last_name: "Doe",
      phone: "5551234567",
      source: "astro_waitlist",
    });
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

describe("legacy public.waitlist client path", () => {
  it("does not insert public.waitlist with the anon supabase client", () => {
    const src = readFileSync(join(root, "src/db/db.js"), "utf8");
    expect(src).toMatch(/\/api\/intake-waitlist/);
    expect(src).not.toMatch(/from\("waitlist"\)\.insert/);
  });

  it("schema snapshot does not recreate waitlist_insert_public", () => {
    const schema = readFileSync(join(root, "supabase/schema.sql"), "utf8");
    expect(schema).toMatch(/drop policy if exists "waitlist_insert_public"/);
    expect(schema).not.toMatch(/create policy "waitlist_insert_public"/);
    expect(schema).toMatch(/waitlist_select_admin/);
  });
});
