import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizeCron,
  claimNotificationJob,
  createJobDeadline,
  enqueueBackground,
  finishNotificationJob,
  listDeliveredProfileIds,
  listDueNotificationJobs,
  raceDeadline,
  releaseNotificationDelivery,
  reserveNotificationDelivery,
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

  it("reserves recovery capacity for fresh jobs ahead of stale leases", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(
        Array.from({ length: 9 }, (_, index) => ({
          id: index + 1,
          status: "pending",
          available_at: `2026-08-10T10:00:0${index}Z`,
        })),
      ), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(
        Array.from({ length: 20 }, (_, index) => ({
          id: 100 + index,
          status: "processing",
          available_at: "2026-08-01T00:00:00Z",
        })),
      ), { status: 200 }));

    const jobs = await listDueNotificationJobs(env, 12);
    expect(jobs).toHaveLength(12);
    expect(jobs.filter((job) => job.status === "pending")).toHaveLength(9);
    expect(jobs.filter((job) => job.status === "processing")).toHaveLength(3);
  });

  it("rejects with timeout when the job deadline aborts after claim", async () => {
    const deadline = createJobDeadline(20);
    const started = Date.now();
    await expect(raceDeadline(deadline.signal, () => new Promise(() => {})))
      .rejects.toThrow("timeout");
    expect(Date.now() - started).toBeLessThan(200);
    deadline.cancel();
  });

  it("loads per-recipient delivery receipts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([
      { profile_id: "00000000-0000-4000-8000-000000000041" },
    ]), { status: 200 }));

    const delivered = await listDeliveredProfileIds(env, "channel", "message-id");
    expect(delivered.has("00000000-0000-4000-8000-000000000041")).toBe(true);
  });

  it("reserves a recipient atomically and treats a conflict as already sent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("true", { status: 200 }))
      .mockResolvedValueOnce(new Response("false", { status: 200 }));

    await expect(reserveNotificationDelivery(
      env,
      "channel",
      "message-id",
      "00000000-0000-4000-8000-000000000041",
    )).resolves.toBe(true);
    await expect(reserveNotificationDelivery(
      env,
      "channel",
      "message-id",
      "00000000-0000-4000-8000-000000000041",
    )).resolves.toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain("reserve_message_notification_delivery");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      p_message_type: "channel",
      p_message_id: "message-id",
      p_profile_id: "00000000-0000-4000-8000-000000000041",
    });
  });

  it("fails closed when a delivery reservation cannot be written", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(reserveNotificationDelivery(
      env,
      "channel",
      "message-id",
      "00000000-0000-4000-8000-000000000041",
    )).rejects.toThrow("delivery reserve failed");
  });

  it("releases a reservation only through the dedicated RPC", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("true", { status: 200 }),
    );
    await expect(releaseNotificationDelivery(
      env,
      "channel",
      "message-id",
      "00000000-0000-4000-8000-000000000041",
    )).resolves.toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain("release_message_notification_delivery");
  });

  it("runs work inline when waitUntil is missing", async () => {
    expect(enqueueBackground(undefined, async () => "ok")).toBe(false);
  });

  it("registers waitUntil work without awaiting it", async () => {
    let queued = null;
    const waitUntil = (promise) => { queued = promise; };
    expect(enqueueBackground(waitUntil, async () => "ok")).toBe(true);
    expect(queued).toBeInstanceOf(Promise);
    await expect(queued).resolves.toBe("ok");
  });
});

