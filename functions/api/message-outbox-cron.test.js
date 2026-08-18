import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  notifyDm: vi.fn(),
  notifyChannel: vi.fn(),
}));

vi.mock("../_shared/messageOutbox.js", async () => {
  const actual = await vi.importActual("../_shared/messageOutbox.js");
  return {
    ...actual,
    authorizeCron: () => true,
    listDueNotificationJobs: mocks.list,
  };
});

vi.mock("./message-notify.js", () => ({
  onRequestPost: (...args) => mocks.notifyDm(...args),
}));

vi.mock("./channel-notify.js", () => ({
  onRequestPost: (...args) => mocks.notifyChannel(...args),
}));

import { drainNotificationOutbox } from "./message-outbox-cron.js";

const env = { CRON_SECRET: "cron" };

function cronRequest() {
  return new Request("https://example.com/api/message-outbox-cron", {
    method: "POST",
    headers: {
      authorization: "Bearer cron",
      "content-type": "application/json",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("message outbox cron drain", () => {
  it("awaits the handler after abort so a claimed job can finish", async () => {
    mocks.list.mockResolvedValue([{
      id: 11,
      message_type: "dm",
      message_id: "10000000-0000-4000-8000-000000000011",
    }]);
    let finishedClaim = false;
    mocks.notifyDm.mockImplementation(async ({ signal }) => {
      await new Promise((resolve, reject) => {
        if (!signal) {
          reject(new Error("missing deadline signal"));
          return;
        }
        const done = () => {
          finishedClaim = true;
          resolve();
        };
        if (signal.aborted) {
          done();
          return;
        }
        signal.addEventListener("abort", done, { once: true });
      });
      return new Response(JSON.stringify({ error: "notify failed" }), { status: 500 });
    });

    const response = await drainNotificationOutbox({
      request: cronRequest(),
      env,
      timeoutMs: 20,
    });
    const body = await response.json();

    expect(finishedClaim).toBe(true);
    expect(response.status).toBe(500);
    expect(body.failed).toBe(1);
    expect(mocks.notifyDm).toHaveBeenCalledWith(expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });

  it("passes waitUntil through so email fallback stays off the drain", async () => {
    mocks.list.mockResolvedValue([{
      id: 12,
      message_type: "channel",
      message_id: "10000000-0000-4000-8000-000000000012",
    }]);
    const waitUntil = vi.fn();
    mocks.notifyChannel.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const response = await drainNotificationOutbox({
      request: cronRequest(),
      env,
      waitUntil,
      timeoutMs: 50,
    });

    expect(response.status).toBe(200);
    expect(mocks.notifyChannel).toHaveBeenCalledWith(expect.objectContaining({
      waitUntil,
      signal: expect.any(AbortSignal),
    }));
  });
});
