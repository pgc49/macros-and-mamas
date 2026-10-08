import { describe, expect, it, vi } from "vitest";

const openrouter = vi.hoisted(() => ({
  logAiFailure: vi.fn(),
}));

vi.mock("./openrouter.js", () => openrouter);

import {
  COACH_CRISIS_EMAIL,
  DEFAULT_CALLIE_NOTIFY_EMAIL,
  buildCrisisAlert,
  callieOpsEmail,
  crisisEmailHourKey,
  notifyCrisisEmail,
} from "./coachCrisisEmail.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const NOW = new Date("2026-10-08T20:00:00.000Z");

describe("notifyCrisisEmail", () => {
  it("is off until Patrick turns it on, and uses the existing ops address", () => {
    expect(COACH_CRISIS_EMAIL).toBe(false);
    expect(callieOpsEmail({})).toBe(DEFAULT_CALLIE_NOTIFY_EMAIL);
    expect(callieOpsEmail({ CALLIE_NOTIFY_EMAIL: "ops@example.com" })).toBe("ops@example.com");
    expect(DEFAULT_CALLIE_NOTIFY_EMAIL).toBe("calista@nourishwithcalista.com");
  });

  it("does not send when the switch is off", async () => {
    const send = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await notifyCrisisEmail({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    }, {
      userId: USER_ID,
      asked: "I want to die",
      now: NOW,
      send,
    });
    expect(result).toEqual({ ok: false, skipped: true });
    expect(send).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("sends Callie one plain email and skips a second in the same hour when on", async () => {
    const send = vi.fn(async () => ({ data: { id: "re_1" }, error: null }));
    const tickets = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("estimate_calls") && init?.method === "POST") {
        const body = JSON.parse(init.body);
        if (tickets.includes(body.request_id)) {
          return new Response(null, { status: 409 });
        }
        tickets.push(body.request_id);
        return new Response(null, { status: 201 });
      }
      if (String(url).includes("/rest/v1/profiles")) {
        return new Response(JSON.stringify([{ name: "Sam" }]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      CALLIE_NOTIFY_EMAIL: "calista@nourishwithcalista.com",
      APP_ORIGIN: "https://app.macrosandmamas.com",
    };
    const first = await notifyCrisisEmail(env, {
      userId: USER_ID,
      asked: "I want to die",
      now: NOW,
      send,
      enabled: true,
    });
    expect(first).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][1];
    expect(mail.to).toEqual(["calista@nourishwithcalista.com"]);
    expect(mail.subject).toBe("Coach: urgent message from Sam");
    expect(mail.text).toContain("Mama: Sam");
    expect(mail.text).toContain("Pacific time:");
    expect(mail.text).toContain("Message: I want to die");
    expect(mail.text).toContain(`client=${USER_ID}`);
    expect(crisisEmailHourKey(USER_ID, NOW)).toMatch(/crisis-email\//);

    const repeat = await notifyCrisisEmail(env, {
      userId: USER_ID,
      asked: "I fainted after lunch",
      now: NOW,
      send,
      enabled: true,
    });
    expect(repeat).toEqual({ ok: true, skipped: "hourly" });
    expect(send).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("does not send when the hourly dedupe insert fails", async () => {
    const send = vi.fn();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const result = await notifyCrisisEmail({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    }, {
      userId: USER_ID,
      asked: "I want to die",
      first: "Sam",
      now: NOW,
      send,
      enabled: true,
    });
    expect(result).toEqual({ ok: false, error: "dedupe" });
    expect(send).not.toHaveBeenCalled();
    expect(openrouter.logAiFailure).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: USER_ID,
      kind: "crisis-email",
      detail: "crisis email dedupe insert failed",
    }));
    vi.restoreAllMocks();
  });

  it("logs a failed send", async () => {
    const send = vi.fn(async () => ({ data: null, error: { message: "resend down" } }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const result = await notifyCrisisEmail({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    }, {
      userId: USER_ID,
      asked: "I want to die",
      first: "Sam",
      now: NOW,
      send,
      enabled: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe("resend down");
    expect(openrouter.logAiFailure).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: USER_ID,
      kind: "crisis-email",
      detail: "resend down",
    }));
    expect(buildCrisisAlert({
      first: "Sam",
      asked: "I want to die",
      now: NOW,
      adminUrl: "https://app.macrosandmamas.com/admin?client=x",
    }).subject).toBe("Coach: urgent message from Sam");
    vi.restoreAllMocks();
  });
});
