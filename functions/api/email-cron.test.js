import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unsub: vi.fn(),
  send: vi.fn(),
  finish: vi.fn(),
  intake: vi.fn(),
  contact: vi.fn(),
}));

vi.mock("../_shared/emailUnsubscribe.mjs", () => ({
  fetchUnsubscribedEmails: (...args) => mocks.unsub(...args),
}));

vi.mock("../_shared/quizDripSend.js", () => ({
  sendQuizDripEmail: (...args) => mocks.send(...args),
}));

vi.mock("../_shared/supabaseEmail.js", () => ({
  loadUserContact: (...args) => mocks.contact(...args),
  sendFinishJoiningEmail: (...args) => mocks.finish(...args),
  sendIntakeReminderEmail: (...args) => mocks.intake(...args),
}));

import { runQuizLeadDrip } from "./email-cron.js";

const env = {
  CRON_SECRET: "cron",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  RESEND_API_KEY: "re_test",
};

const NOW = Date.parse("2026-08-18T12:00:00.000Z");

function restOk(rows) {
  return new Response(JSON.stringify(rows), { status: 200 });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.unsub.mockResolvedValue({ ok: true, emails: new Set() });
  mocks.send.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runQuizLeadDrip", () => {
  it("sends +2d to a quiz-only lead and skips paid, profile, and plant-based", async () => {
    const due = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString();
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/marketing_leads")) {
        return restOk([
          {
            email: "due@example.com",
            first_name: "Due",
            segment: "main",
            created_at: due,
          },
          {
            email: "signedup@example.com",
            first_name: "Signed",
            segment: "main",
            created_at: due,
          },
          {
            email: "paid@example.com",
            first_name: "Paid",
            segment: "main",
            created_at: due,
          },
          {
            email: "vegan@example.com",
            first_name: "Vegan",
            segment: "waitlist_plantbased",
            created_at: due,
          },
        ]);
      }
      if (href.includes("/email_events")) {
        return restOk([
          { to_email: "due@example.com", email_type: "quiz_ranges", created_at: due, status: "sent" },
          { to_email: "signedup@example.com", email_type: "quiz_ranges", created_at: due, status: "sent" },
          { to_email: "paid@example.com", email_type: "quiz_ranges", created_at: due, status: "sent" },
          { to_email: "vegan@example.com", email_type: "quiz_ranges", created_at: due, status: "sent" },
        ]);
      }
      return restOk([]);
    }));

    const sent = await runQuizLeadDrip({
      env,
      base: env.SUPABASE_URL,
      key: env.SUPABASE_SERVICE_ROLE_KEY,
      now: NOW,
      profiles: [
        { id: "p-unpaid", email: "signedup@example.com", paid: false },
        { id: "p1", email: "paid@example.com", paid: true },
      ],
    });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1]).toEqual(expect.objectContaining({
      email: "due@example.com",
      step: "quiz_drip_2d",
    }));
    expect(sent.quiz_drip_2d).toBe(1);
    expect(sent.errors).toBe(0);
  });

  it("does not send when the unsubscribe list cannot be read", async () => {
    mocks.unsub.mockResolvedValue({ ok: false, emails: new Set() });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const sent = await runQuizLeadDrip({
      env,
      base: env.SUPABASE_URL,
      key: env.SUPABASE_SERVICE_ROLE_KEY,
      now: NOW,
      profiles: [],
    });

    expect(sent.errors).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
