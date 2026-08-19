import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./confirm-fresh-signup.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function request(
  body,
  origin = "https://www.macrosandmamas.com",
  url = "https://www.macrosandmamas.com/api/confirm-fresh-signup",
  extraHeaders = {},
) {
  const headers = {
    "content-type": "application/json",
    ...extraHeaders,
  };
  if (origin) headers.origin = origin;
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("POST /api/confirm-fresh-signup", () => {
  it("rejects a foreign origin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await onRequestPost({
      request: request({ email: "mama@x.com" }, "https://evil.example"),
      env,
    });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects the production admin origin and Host", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const fromOrigin = await onRequestPost({
      request: request(
        { email: "mama@x.com" },
        "https://admin.macrosandmamas.com",
        "https://admin.macrosandmamas.com/api/confirm-fresh-signup",
      ),
      env,
    });
    const fromHost = await onRequestPost({
      request: request(
        { email: "mama@x.com" },
        "",
        "https://admin.macrosandmamas.com/api/confirm-fresh-signup",
        { host: "admin.macrosandmamas.com" },
      ),
      env,
    });
    expect(fromOrigin.status).toBe(403);
    expect(fromHost.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects admin Pages preview hosts even though they are *.pages.dev", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await onRequestPost({
      request: request(
        { email: "mama@x.com" },
        "https://deadbeef.macros-and-mamas-admin.pages.dev",
        "https://deadbeef.macros-and-mamas-admin.pages.dev/api/confirm-fresh-signup",
      ),
      env,
    });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still allows a customer Pages preview to confirm a www-style signup", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ users: [] }), { status: 200 }),
    );
    const res = await onRequestPost({
      request: request(
        { email: "mama@x.com" },
        "https://abc.macros-and-mamas.pages.dev",
        "https://abc.macros-and-mamas.pages.dev/api/confirm-fresh-signup",
      ),
      env,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("confirms a fresh unconfirmed user", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        users: [{
          id: "u1",
          email: "mama@x.com",
          created_at: new Date().toISOString(),
          email_confirmed_at: null,
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await onRequestPost({
      request: request({ email: "mama@x.com" }),
      env,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/v1/admin/users/u1");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email_confirm: true });
  });

  it("pages past 50 users to confirm a fresh signup", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({
      id: `other-${i}`,
      email: `other${i}@x.com`,
      created_at: new Date().toISOString(),
      email_confirmed_at: null,
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: page1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        users: [{
          id: "u51",
          email: "mama@x.com",
          created_at: new Date().toISOString(),
          email_confirmed_at: null,
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await onRequestPost({
      request: request({ email: "mama@x.com" }),
      env,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain("page=1");
    expect(String(fetchMock.mock.calls[1][0])).toContain("page=2");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/auth/v1/admin/users/u51");
  });

  it("does not confirm a stale unconfirmed user", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        users: [{
          id: "u1",
          email: "mama@x.com",
          created_at: "2020-01-01T00:00:00.000Z",
          email_confirmed_at: null,
        }],
      }), { status: 200 }),
    );

    const res = await onRequestPost({
      request: request({ email: "mama@x.com" }),
      env,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
