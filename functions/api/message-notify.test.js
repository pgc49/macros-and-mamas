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
  vi.restoreAllMocks();
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
      if (value.includes("/rest/v1/messages?") && options.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-range": "0-0/1" },
        });
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

  it("finishes a claimed job as timeout when the drain aborts after claim", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = onRequestPost({
      request: request("10000000-0000-4000-8000-000000000013"),
      env,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(mocks.claim).toHaveBeenCalled());
    controller.abort();

    const response = await pending;
    expect(response.status).toBe(500);
    expect(mocks.finish).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: 1 }),
      { success: false, error: "timeout" },
    );
  });

  it("falls back to email when admin→mama push returns retryable dead-sub failures", async () => {
    const senderId = "00000000-0000-4000-8000-000000000021";
    const mamaId = "00000000-0000-4000-8000-000000000022";
    const messageId = "10000000-0000-4000-8000-000000000022";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
      const value = String(url);
      if (value.includes("/rest/v1/messages?id=eq.")) {
        return new Response(JSON.stringify([{
          id: messageId,
          client_id: mamaId,
          sender_id: senderId,
          body: "Announcement from Callie",
          kind: "announcement",
          deleted_at: null,
          notified_at: null,
        }]), { status: 200 });
      }
      if (value.includes(`/rest/v1/profiles?id=eq.${senderId}`)) {
        return new Response(JSON.stringify([{
          id: senderId,
          name: "Callie",
          email: "calista@nourishwithcalista.com",
          role: "admin",
        }]), { status: 200 });
      }
      if (value.includes(`/rest/v1/profiles?id=eq.${mamaId}`)) {
        return new Response(JSON.stringify([{
          id: mamaId,
          name: "Mama",
          email: "mama@example.com",
          role: "client",
        }]), { status: 200 });
      }
      if (value.includes("/rest/v1/messages?") && options.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-range": "0-0/1" },
        });
      }
      if (value.includes("/rest/v1/messages?") && options.method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch ${value}`);
    });
    mocks.invoke.mockImplementation(async (_env, name) => {
      if (name === "send-push") {
        return {
          ok: true,
          status: 200,
          data: { sent: 0, attempted: 1, failures: [{ status: 403, message: "expired" }] },
        };
      }
      if (name === "message-email") {
        return { ok: true, status: 200, data: { id: "email-1" } };
      }
      throw new Error(`unexpected edge function ${name}`);
    });
    mocks.contact.mockResolvedValue({
      email: "mama@example.com",
      name: "Mama",
    });

    const response = await onRequestPost({
      request: request(messageId),
      env,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.emailSent).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith(
      env,
      "message-email",
      expect.objectContaining({ email: "mama@example.com" }),
    );
    expect(mocks.finish).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: 1 }),
      { success: true },
    );
  });

  it("queues no-push email off the claim/finish path when waitUntil is available", async () => {
    const senderId = "00000000-0000-4000-8000-000000000023";
    const mamaId = "00000000-0000-4000-8000-000000000024";
    const messageId = "10000000-0000-4000-8000-000000000024";
    let resolveEmail;
    const emailGate = new Promise((resolve) => { resolveEmail = resolve; });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
      const value = String(url);
      if (value.includes("/rest/v1/messages?id=eq.")) {
        return new Response(JSON.stringify([{
          id: messageId,
          client_id: mamaId,
          sender_id: senderId,
          body: "Hi mama",
          kind: "chat",
          deleted_at: null,
          notified_at: null,
        }]), { status: 200 });
      }
      if (value.includes(`/rest/v1/profiles?id=eq.${senderId}`)) {
        return new Response(JSON.stringify([{
          id: senderId,
          name: "Callie",
          email: "calista@nourishwithcalista.com",
          role: "admin",
        }]), { status: 200 });
      }
      if (value.includes(`/rest/v1/profiles?id=eq.${mamaId}`)) {
        return new Response(JSON.stringify([{
          id: mamaId,
          name: "Mama",
          email: "mama@example.com",
          role: "client",
        }]), { status: 200 });
      }
      if (value.includes("/rest/v1/messages?") && options.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-range": "0-0/1" },
        });
      }
      if (value.includes("/rest/v1/messages?") && options.method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch ${value}`);
    });
    mocks.invoke.mockImplementation(async (_env, name) => {
      if (name === "send-push") {
        return { ok: true, status: 200, data: { sent: 0, attempted: 0 } };
      }
      if (name === "message-email") {
        await emailGate;
        return { ok: true, status: 200, data: { id: "email-2" } };
      }
      throw new Error(`unexpected edge function ${name}`);
    });
    mocks.contact.mockResolvedValue({
      email: "mama@example.com",
      name: "Mama",
    });
    const background = [];
    const waitUntil = (promise) => { background.push(promise); };

    const response = await onRequestPost({
      request: request(messageId),
      env,
      waitUntil,
    });

    expect(response.status).toBe(200);
    expect(mocks.finish).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: 1 }),
      { success: true },
    );
    expect(mocks.invoke).toHaveBeenCalledWith(
      env,
      "message-email",
      expect.objectContaining({ email: "mama@example.com" }),
    );
    expect(background).toHaveLength(1);
    resolveEmail();
    await Promise.all(background);
  });
});

