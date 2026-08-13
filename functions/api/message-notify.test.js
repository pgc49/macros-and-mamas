import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(async () => ({
    id: 1,
    attempts: 1,
    claim_token: "10000000-0000-4000-8000-000000000001",
  })),
  finish: vi.fn(async () => ({ status: "retry" })),
  invoke: vi.fn(),
  contact: vi.fn(),
}));

vi.mock("../_shared/messageOutbox.js", () => ({
  authorizeCron: () => true,
  claimNotificationJob: mocks.claim,
  finishNotificationJob: mocks.finish,
}));

vi.mock("../_shared/supabaseEmail.js", () => ({
  invokeEdgeFunction: mocks.invoke,
  loadUserContact: mocks.contact,
  logEmailEvent: vi.fn(),
}));

import { onRequestPost } from "./message-notify.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
  CRON_SECRET: "cron",
  RESEND_API_KEY: "resend",
};

function request(messageId) {
  return new Request("https://example.com/api/message-notify", {
    method: "POST",
    headers: {
      authorization: "Bearer cron",
      "content-type": "application/json",
    },
    body: JSON.stringify({ messageId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("durable DM notification processing", () => {
  it("retries rather than discarding a transient source lookup failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );

    const response = await onRequestPost({
      request: request("10000000-0000-4000-8000-000000000010"),
      env,
    });

    expect(response.status).toBe(500);
    expect(mocks.finish).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ success: false }),
    );
  });

  it("retries when admin-to-admin push and email providers both fail", async () => {
    const senderId = "00000000-0000-4000-8000-000000000011";
    const recipientId = "00000000-0000-4000-8000-000000000012";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
      const value = String(url);
      if (value.includes("/rest/v1/messages?id=eq.")) {
        return new Response(JSON.stringify([{
          id: "10000000-0000-4000-8000-000000000011",
          client_id: recipientId,
          sender_id: senderId,
          body: "Admin note",
          kind: "chat",
          deleted_at: null,
          notified_at: null,
        }]), { status: 200 });
      }
      if (value.includes(`/rest/v1/profiles?id=eq.${senderId}`)) {
        return new Response(JSON.stringify([{
          id: senderId,
          name: "Patrick",
          email: "patrick@example.com",
          role: "admin",
        }]), { status: 200 });
      }
      if (value.includes(`/rest/v1/profiles?id=eq.${recipientId}`)) {
        return new Response(JSON.stringify([{
          id: recipientId,
          name: "Callie",
          email: "callie@example.com",
          role: "admin",
        }]), { status: 200 });
      }
      if (value.includes("/rest/v1/profiles?role=eq.admin")) {
        return new Response(JSON.stringify([
          { id: senderId, name: "Patrick", email: "patrick@example.com", role: "admin" },
          { id: recipientId, name: "Callie", email: "callie@example.com", role: "admin" },
        ]), { status: 200 });
      }
      if (value.includes("/rest/v1/rpc/count_message_unread_for_profile")) {
        return new Response(JSON.stringify(1), { status: 200 });
      }
      if (value === "https://api.resend.com/emails") {
        return new Response("provider down", { status: 503 });
      }
      throw new Error(`unexpected fetch ${value}`);
    });
    mocks.invoke.mockImplementation(async (_env, name) => {
      if (name === "send-push") {
        return { ok: true, status: 200, data: { sent: 0, attempted: 0 } };
      }
      if (name === "message-email") {
        return { ok: false, status: 503, data: null };
      }
      throw new Error(`unexpected edge function ${name}`);
    });
    mocks.contact.mockResolvedValue({
      email: "callie@example.com",
      name: "Callie",
    });

    const response = await onRequestPost({
      request: request("10000000-0000-4000-8000-000000000011"),
      env,
    });

    expect(response.status).toBe(500);
    expect(mocks.finish).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ success: false }),
    );
  });

  it("skips linked admin notifications after either recipient ordering is demoted", async () => {
    const low = "00000000-0000-4000-8000-000000000021";
    const high = "00000000-0000-4000-8000-000000000022";
    for (const [senderId, recipientId] of [[low, high], [high, low]]) {
      vi.clearAllMocks();
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
        const value = String(url);
        if (value.includes("/rest/v1/messages?id=eq.")) {
          if (options.method === "PATCH") return new Response(null, { status: 204 });
          return new Response(JSON.stringify([{
            id: "10000000-0000-4000-8000-000000000021",
            client_id: low,
            sender_id: senderId,
            recipient_id: recipientId,
            admin_dm_conversation_id: "20000000-0000-4000-8000-000000000021",
            body: "Private admin note",
            kind: "chat",
            deleted_at: null,
            notified_at: null,
          }]), { status: 200 });
        }
        if (value.includes(`/rest/v1/profiles?id=eq.${senderId}`)) {
          return new Response(JSON.stringify([{
            id: senderId,
            name: "Active Admin",
            role: "admin",
          }]), { status: 200 });
        }
        if (value.includes(`/rest/v1/profiles?id=eq.${recipientId}`)) {
          return new Response(JSON.stringify([{
            id: recipientId,
            name: "Former Admin",
            role: "client",
          }]), { status: 200 });
        }
        if (value.includes("/rest/v1/admin_dm_conversations")) {
          return new Response(JSON.stringify([{
            participant_low: low,
            participant_high: high,
          }]), { status: 200 });
        }
        throw new Error(`unexpected fetch ${value}`);
      });

      const response = await onRequestPost({
        request: request("10000000-0000-4000-8000-000000000021"),
        env,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expect.objectContaining({
        skipped: "skipped_recipient_deprovisioned",
      }));
      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(mocks.finish).toHaveBeenCalledWith(
        env,
        expect.objectContaining({ id: 1 }),
        { success: true },
      );
    }
  });
});

