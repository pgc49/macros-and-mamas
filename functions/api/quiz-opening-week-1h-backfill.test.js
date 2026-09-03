import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
}));

vi.mock("../_shared/quizOpeningWeek1hRun.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runQuizOpeningWeek1h: (...args) => mocks.run(...args),
  };
});

import { onRequestPost } from "./quiz-opening-week-1h-backfill.js";
import { BACKFILL_CONFIRM, QUIZ_OPENING_WEEK_1H } from "../_shared/quizOpeningWeek1h.mjs";

const env = {
  CRON_SECRET: "cron-secret",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

function request(body, { auth = "Bearer cron-secret" } = {}) {
  return {
    request: new Request("https://www.macrosandmamas.com/api/quiz-opening-week-1h-backfill", {
      method: "POST",
      headers: {
        authorization: auth,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    env,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.run.mockResolvedValue({
    [QUIZ_OPENING_WEEK_1H]: 0,
    planned: 2,
    skipped: 1,
    skippedReasons: { paid: 1 },
    errors: 0,
    plans: [{ cta: "join", hasProfile: false, ageMs: 36 * 60 * 60 * 1000 }],
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("quiz-opening-week-1h-backfill", () => {
  it("requires an emails allowlist and stays dry-run by default", async () => {
    const missing = await onRequestPost(request({}));
    expect(missing.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();

    const dry = await onRequestPost(request({
      emails: ["one@example.com", "two@example.com"],
    }));
    expect(dry.status).toBe(200);
    const body = await dry.json();
    expect(body.dryRun).toBe(true);
    expect(body.sent).toBe(0);
    expect(body.wouldSend).toBe(2);
    expect(body.confirmRequired).toBe(BACKFILL_CONFIRM);
    expect(body.event).toBe(QUIZ_OPENING_WEEK_1H);
    expect(JSON.stringify(body)).not.toMatch(/@example\.com/);
    expect(mocks.run.mock.calls[0][0]).toEqual(expect.objectContaining({
      mode: "backfill",
      dryRun: true,
      allowlist: ["one@example.com", "two@example.com"],
    }));
  });

  it("sends only when confirm matches and dryRun is false", async () => {
    mocks.run.mockResolvedValue({
      [QUIZ_OPENING_WEEK_1H]: 1,
      planned: 1,
      skipped: 0,
      skippedReasons: {},
      errors: 0,
      plans: [{ cta: "checkout", hasProfile: true, ageMs: 40 * 60 * 60 * 1000 }],
    });
    const denied = await onRequestPost(request({
      emails: ["one@example.com"],
      dryRun: false,
      confirm: "SEND",
    }));
    expect((await denied.json()).dryRun).toBe(true);
    expect(mocks.run.mock.calls[0][0].dryRun).toBe(true);

    const allowed = await onRequestPost(request({
      emails: ["one@example.com"],
      dryRun: false,
      confirm: BACKFILL_CONFIRM,
    }));
    const sentBody = await allowed.json();
    expect(sentBody.dryRun).toBe(false);
    expect(sentBody.sent).toBe(1);
    expect(mocks.run.mock.calls[1][0].dryRun).toBe(false);
  });

  it("rejects a missing cron secret", async () => {
    const resp = await onRequestPost(request(
      { emails: ["one@example.com"] },
      { auth: "Bearer nope" },
    ));
    expect(resp.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
