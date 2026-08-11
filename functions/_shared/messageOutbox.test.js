import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizeCron,
  claimNotificationJob,
  finishNotificationJob,
} from "./messageOutbox.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  CRON_SECRET: "cron-secret",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("message notification outbox", () => {
  it("claims a specific due message atomically", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([
      {
        id: 7,
        message_type: "dm",
        message_id: "message-id",
        attempts: 1,
        claim_token: "10000000-0000-4000-8000-000000000007",
      },
    ]), { status: 200 }));

    const job = await claimNotificationJob(env, "dm", "message-id");
    expect(job.id).toBe(7);
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      p_message_type: "dm",
      p_message_id: "message-id",
    });
  });

  it("schedules exponential retry and eventually marks dead", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 8, status: "retry" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 9, status: "dead" }]), { status: 200 }));

    const retry = await finishNotificationJob(env, {
      id: 8,
      attempts: 1,
      claim_token: "10000000-0000-4000-8000-000000000008",
    }, {
      success: false,
      error: "provider unavailable",
    });
    const retryArgs = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(retry.status).toBe("retry");
    expect(retryArgs.p_error).toBe("provider unavailable");
    expect(retryArgs.p_claim_token).toBe("10000000-0000-4000-8000-000000000008");

    const dead = await finishNotificationJob(env, {
      id: 9,
      attempts: 6,
      claim_token: "10000000-0000-4000-8000-000000000009",
    }, {
      success: false,
      error: "still unavailable",
    });
    expect(dead.status).toBe("dead");
  });

  it("uses constant-time cron secret comparison", () => {
    const request = new Request("https://example.com/api/cron", {
      headers: { authorization: "Bearer cron-secret" },
    });
    expect(authorizeCron(request, env)).toBe(true);
    expect(authorizeCron(new Request("https://example.com"), env)).toBe(false);
  });
});

