import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(async () => ({
    id: 2,
    attempts: 1,
    claim_token: "10000000-0000-4000-8000-000000000002",
  })),
  finish: vi.fn(async () => ({ status: "retry" })),
}));

vi.mock("../_shared/messageOutbox.js", () => ({
  authorizeCron: () => true,
  claimNotificationJob: mocks.claim,
  finishNotificationJob: mocks.finish,
}));

vi.mock("../_shared/supabaseEmail.js", () => ({
  invokeEdgeFunction: vi.fn(),
}));

import { onRequestPost } from "./channel-notify.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("durable channel notification processing", () => {
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
});

