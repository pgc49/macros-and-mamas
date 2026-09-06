import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(async () => ({
    id: 2,
    attempts: 1,
    claim_token: "10000000-0000-4000-8000-000000000002",
  })),
  finish: vi.fn(async () => ({ status: "retry" })),
  delivered: vi.fn(async () => new Set()),
  record: vi.fn(async () => true),
  invoke: vi.fn(),
}));

vi.mock("../_shared/messageOutbox.js", async () => {
  const actual = await vi.importActual("../_shared/messageOutbox.js");
  return {
    ...actual,
    authorizeCron: () => true,
    claimNotificationJob: mocks.claim,
    finishNotificationJob: mocks.finish,
    listDeliveredProfileIds: mocks.delivered,
    recordNotificationDelivery: mocks.record,
  };
});

vi.mock("../_shared/supabaseEmail.js", () => ({
  invokeEdgeFunction: mocks.invoke,
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
    expect(channelNotificationUrl("channel-1", false, "m-9")).toBe(
      "/dashboard?tab=messages&channel=channel-1&message=m-9",
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

  it("does not re-fanout a channel message older than two hours", async () => {
    mocks.finish.mockResolvedValue({ status: "sent" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{
        id: "10000000-0000-4000-8000-000000000030",
        conversation_id: "da3da5de-af01-4aed-887c-1cedbe964bb5",
        sender_id: "1f1d7bea-12bc-4c1c-9ba7-1cc7abd17332",
        body: "Big wins, mamas!!!!",
        kind: "chat",
        deleted_at: null,
        notified_at: null,
        created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      }]), { status: 200 }),
    );
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      CRON_SECRET: "cron",
    };
    const response = await onRequestPost({
      request: new Request("https://example.com/api/channel-notify", {
        method: "POST",
        headers: {
          authorization: "Bearer cron",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messageId: "10000000-0000-4000-8000-000000000030",
        }),
      }),
      env,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skipped).toBe("too_old");
    expect(body.pushSent).toBe(0);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: 2 }),
      { success: true },
    );
  });

  it("skips recipients who already got the push on a prior attempt", async () => {
    const mamaId = "00000000-0000-4000-8000-000000000041";
    const adminId = "00000000-0000-4000-8000-000000000042";
    const messageId = "10000000-0000-4000-8000-000000000040";
    mocks.finish.mockResolvedValue({ status: "sent" });
    mocks.delivered.mockResolvedValue(new Set([mamaId]));
    mocks.invoke.mockResolvedValue({
      ok: true,
      data: { sent: 1, attempted: 1 },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const value = String(url);
      if (value.includes("/rest/v1/conversation_messages?id=eq.")) {
        return new Response(JSON.stringify([{
          id: messageId,
          conversation_id: "conv-1",
          sender_id: adminId,
          body: "Big wins, mamas!!!!",
          kind: "chat",
          deleted_at: null,
          notified_at: null,
          created_at: new Date().toISOString(),
        }]), { status: 200 });
      }
      if (value.includes("/rest/v1/conversations?")) {
        return new Response(JSON.stringify([{
          id: "conv-1",
          type: "cohort",
          label: "Founding Members",
        }]), { status: 200 });
      }
      if (value.includes("/rest/v1/profiles?id=eq.")) {
        return new Response(JSON.stringify([{
          id: adminId,
          name: "Callie",
          email: "calista@nourishwithcalista.com",
          role: "admin",
        }]), { status: 200 });
      }
      if (value.includes("/rest/v1/conversation_members?")) {
        return new Response(JSON.stringify([
          { conversation_id: "conv-1", user_id: adminId, notify_level: "highlights", removed_at: null },
          { conversation_id: "conv-1", user_id: mamaId, notify_level: "highlights", removed_at: null },
        ]), { status: 200 });
      }
      if (value.includes("/rest/v1/profiles?role=eq.admin")) {
        return new Response(JSON.stringify([{ id: adminId }]), { status: 200 });
      }
      if (value.includes("/rest/v1/conversation_messages?") && value.includes("id=eq.")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (value.includes("/rest/v1/conversation_messages?id=eq.") === false
        && value.includes("/rest/v1/conversation_messages?")) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch ${value}`);
    });

    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      CRON_SECRET: "cron",
    };
    const response = await onRequestPost({
      request: new Request("https://example.com/api/channel-notify", {
        method: "POST",
        headers: {
          authorization: "Bearer cron",
          "content-type": "application/json",
        },
        body: JSON.stringify({ messageId }),
      }),
      env,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pushSent).toBe(0);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: 2 }),
      { success: true },
    );
  });

  it("sends only to members who have not already received the push", async () => {
    const mamaDelivered = "00000000-0000-4000-8000-000000000041";
    const mamaFresh = "00000000-0000-4000-8000-000000000043";
    const adminId = "00000000-0000-4000-8000-000000000042";
    const messageId = "10000000-0000-4000-8000-000000000044";
    mocks.finish.mockResolvedValue({ status: "sent" });
    mocks.delivered.mockResolvedValue(new Set([mamaDelivered]));
    mocks.invoke.mockResolvedValue({
      ok: true,
      data: { sent: 1, attempted: 1 },
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const value = String(url);
      if (value.includes("/rest/v1/conversation_messages?id=eq.")) {
        if (value.includes(messageId)) {
          return new Response(JSON.stringify([{
            id: messageId,
            conversation_id: "conv-1",
            sender_id: adminId,
            body: "Big wins, mamas!!!!",
            kind: "chat",
            deleted_at: null,
            notified_at: null,
            created_at: new Date().toISOString(),
          }]), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (value.includes("/rest/v1/conversations?")) {
        return new Response(JSON.stringify([{
          id: "conv-1",
          type: "cohort",
          label: "Founding Members",
        }]), { status: 200 });
      }
      if (value.includes("/rest/v1/profiles?id=eq.")) {
        return new Response(JSON.stringify([{
          id: adminId,
          name: "Callie",
          email: "calista@nourishwithcalista.com",
          role: "admin",
        }]), { status: 200 });
      }
      if (value.includes("/rest/v1/conversation_members?")) {
        return new Response(JSON.stringify([
          { conversation_id: "conv-1", user_id: adminId, notify_level: "highlights", removed_at: null },
          { conversation_id: "conv-1", user_id: mamaDelivered, notify_level: "highlights", removed_at: null },
          { conversation_id: "conv-1", user_id: mamaFresh, notify_level: "highlights", removed_at: null },
        ]), { status: 200 });
      }
      if (value.includes("/rest/v1/profiles?role=eq.admin")) {
        return new Response(JSON.stringify([{ id: adminId }]), { status: 200 });
      }
      if (value.includes("/rest/v1/conversation_messages?")) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch ${value}`);
    });

    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      CRON_SECRET: "cron",
    };
    const response = await onRequestPost({
      request: new Request("https://example.com/api/channel-notify", {
        method: "POST",
        headers: {
          authorization: "Bearer cron",
          "content-type": "application/json",
        },
        body: JSON.stringify({ messageId }),
      }),
      env,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pushSent).toBe(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith(
      env,
      "send-push",
      expect.objectContaining({
        profileId: mamaFresh,
        tag: `channel:${messageId}`,
      }),
      expect.objectContaining({ timeoutMs: 5000 }),
    );
    expect(mocks.record).toHaveBeenCalledWith(env, "channel", messageId, mamaFresh);
    expect(mocks.record).not.toHaveBeenCalledWith(env, "channel", messageId, mamaDelivered);
  });
});

