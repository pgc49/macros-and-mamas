import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(async () => ({
    id: 2,
    attempts: 1,
    claim_token: "10000000-0000-4000-8000-000000000002",
  })),
  finish: vi.fn(async () => ({ status: "retry" })),
}));

vi.mock("../_shared/messageOutbox.js", async () => {
  const actual = await vi.importActual("../_shared/messageOutbox.js");
  return {
    ...actual,
    authorizeCron: () => true,
    claimNotificationJob: mocks.claim,
    finishNotificationJob: mocks.finish,
  };
});

vi.mock("../_shared/supabaseEmail.js", () => ({
  invokeEdgeFunction: vi.fn(),
}));

import {
  channelNotificationUrl,
  onRequestPost,
} from "./channel-notify.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("durable channel notification processing", () => {
  it("routes admin and customer push opens to their own surfaces", () => {
    expect(channelNotificationUrl("channel-1", true)).toBe(
      "/admin?tab=messages&channel=channel-1",
    );
    expect(channelNotificationUrl("channel-1", false)).toBe(
      "/dashboard?tab=messages&channel=channel-1",
    );
  });

  it("retries malformed successful source responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      CRON_SECRET: "cron",
    };
    const request = new Request("https://example.com/api/channel-notify", {
      method: "POST",
      headers: {
        authorization: "Bearer cron",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messageId: "10000000-0000-4000-8000-000000000020",
      }),
    });

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(500);
    expect(mocks.finish).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: 2 }),
      expect.objectContaining({ success: false }),
    );
  });

  it("finishes a claimed channel job as timeout when the drain aborts after claim", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      CRON_SECRET: "cron",
    };
    const controller = new AbortController();
    const pending = onRequestPost({
      request: new Request("https://example.com/api/channel-notify", {
        method: "POST",
        headers: {
          authorization: "Bearer cron",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messageId: "10000000-0000-4000-8000-000000000021",
        }),
      }),
      env,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(mocks.claim).toHaveBeenCalled());
    controller.abort();

    const response = await pending;
    expect(response.status).toBe(500);
    expect(mocks.finish).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: 2 }),
      { success: false, error: "timeout" },
    );
  });
});

