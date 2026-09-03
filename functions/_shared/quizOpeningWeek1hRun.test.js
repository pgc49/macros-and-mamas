import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unsub: vi.fn(),
  send: vi.fn(),
}));

vi.mock("./emailUnsubscribe.mjs", () => ({
  fetchUnsubscribedEmails: (...args) => mocks.unsub(...args),
}));

vi.mock("./quizOpeningWeek1hSend.js", () => ({
  sendQuizOpeningWeek1hEmail: (...args) => mocks.send(...args),
}));

import { runQuizOpeningWeek1h } from "./quizOpeningWeek1hRun.js";
import { QUIZ_OPENING_WEEK_1H } from "./quizOpeningWeek1h.mjs";

const env = {
  CRON_SECRET: "cron",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  RESEND_API_KEY: "re_test",
};

const NOW = Date.parse("2026-09-03T18:00:00.000Z");
const HOUR = 60 * 60 * 1000;

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

describe("runQuizOpeningWeek1h", () => {
  it("sends to Track A no-account and account-unpaid, skips paid and plant-based", async () => {
    const due = new Date(NOW - 2 * HOUR).toISOString();
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/marketing_leads")) {
        return restOk([
          { id: "l1", email: "due@example.com", first_name: "Due", segment: "main", created_at: due },
          { id: "l2", email: "signedup@example.com", first_name: "Signed", segment: "main", created_at: due },
          { id: "l3", email: "paid@example.com", first_name: "Paid", segment: "main", created_at: due },
          { id: "l4", email: "vegan@example.com", first_name: "Vegan", segment: "waitlist_plantbased", created_at: due },
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

    const sent = await runQuizOpeningWeek1h({
      env,
      base: env.SUPABASE_URL,
      key: env.SUPABASE_SERVICE_ROLE_KEY,
      now: NOW,
      profiles: [
        { id: "p-unpaid", email: "signedup@example.com", paid: false },
        { id: "p-paid", email: "paid@example.com", paid: true },
      ],
    });

    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls.map((call) => call[1].email).sort()).toEqual([
      "due@example.com",
      "signedup@example.com",
    ]);
    expect(sent[QUIZ_OPENING_WEEK_1H]).toBe(2);
    expect(sent.errors).toBe(0);
  });

  it("dry-run plans without sending", async () => {
    const due = new Date(NOW - 2 * HOUR).toISOString();
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/marketing_leads")) {
        return restOk([{ id: "l1", email: "due@example.com", first_name: "Due", segment: "main", created_at: due }]);
      }
      if (href.includes("/email_events")) {
        return restOk([{ to_email: "due@example.com", email_type: "quiz_ranges", created_at: due, status: "sent" }]);
      }
      return restOk([]);
    }));

    const sent = await runQuizOpeningWeek1h({
      env,
      base: env.SUPABASE_URL,
      key: env.SUPABASE_SERVICE_ROLE_KEY,
      now: NOW,
      profiles: [],
      mode: "backfill",
      allowlist: ["due@example.com"],
      dryRun: true,
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(sent.planned).toBe(1);
    expect(sent[QUIZ_OPENING_WEEK_1H]).toBe(0);
    expect(sent.plans[0]).toEqual(expect.objectContaining({ cta: "join", hasProfile: false }));
  });

  it("does not send when the unsubscribe list cannot be read", async () => {
    mocks.unsub.mockResolvedValue({ ok: false, emails: new Set() });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const sent = await runQuizOpeningWeek1h({
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
