import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet, onRequestPost } from "./unsubscribe.js";
import { signUnsubscribeToken } from "../_shared/emailUnsubscribe.mjs";

const env = {
  UNSUBSCRIBE_SECRET: "test-unsub-secret",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedUrl(email = "mama@example.com") {
  const token = await signUnsubscribeToken(env.UNSUBSCRIBE_SECRET, email);
  return `https://www.macrosandmamas.com/api/unsubscribe?e=${encodeURIComponent(email)}&t=${token}`;
}

describe("POST /api/unsubscribe", () => {
  it("rejects a bad token without writing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await onRequestGet({
      request: new Request("https://www.macrosandmamas.com/api/unsubscribe?e=mama@example.com&t=nope"),
      env,
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/isn't valid/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a valid one-click POST", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const res = await onRequestPost({
      request: new Request(await signedUrl(), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
      env,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/unsubscribed/i);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/rest/v1/email_unsubscribes");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: "mama@example.com",
      source: "one_click",
    });
  });
});
