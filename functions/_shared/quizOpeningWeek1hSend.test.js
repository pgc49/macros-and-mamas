import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unsub: vi.fn(),
  hasEvent: vi.fn(),
  log: vi.fn(),
  resend: vi.fn(),
}));

vi.mock("./emailUnsubscribe.mjs", () => ({
  buildUnsubscribeUrl: vi.fn(async () => "https://www.macrosandmamas.com/api/unsubscribe?e=x&t=y"),
  isUnsubscribed: (...args) => mocks.unsub(...args),
  quizMailHeaders: () => ({ "List-Unsubscribe": "<https://example.com>" }),
}));

vi.mock("./emailEvents.mjs", () => ({
  hasEmailEventByEmail: (...args) => mocks.hasEvent(...args),
  logEmailEvent: (...args) => mocks.log(...args),
}));

vi.mock("./resendSend.mjs", () => ({
  sendResendEmail: (...args) => mocks.resend(...args),
}));

import { sendQuizOpeningWeek1hEmail } from "./quizOpeningWeek1hSend.js";
import { QUIZ_OPENING_WEEK_1H } from "./quizOpeningWeek1h.mjs";

const env = { RESEND_API_KEY: "re_test" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.unsub.mockResolvedValue(false);
  mocks.hasEvent.mockResolvedValue(false);
  mocks.log.mockResolvedValue(undefined);
  mocks.resend.mockResolvedValue({ data: { id: "re_ok" }, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendQuizOpeningWeek1hEmail", () => {
  it("sends with a Resend idempotency key and logs sent metadata", async () => {
    const result = await sendQuizOpeningWeek1hEmail(env, {
      email: "mama@example.com",
      firstName: "Dolly",
      lead: { id: "lead-1", first_name: "Dolly", segment: "main" },
    });
    expect(result.ok).toBe(true);
    expect(result.idempotencyKey).toBe("quiz_opening_week_1h/lead-1");
    expect(mocks.resend).toHaveBeenCalledTimes(1);
    const [, payload, opts] = mocks.resend.mock.calls[0];
    expect(payload.subject).toBe("Dolly, opening week is underway");
    expect(payload.to).toEqual(["mama@example.com"]);
    expect(payload.reply_to).toBe("calista@nourishwithcalista.com");
    expect(opts.idempotencyKey).toBe("quiz_opening_week_1h/lead-1");
    expect(mocks.log).toHaveBeenCalledWith(env, expect.objectContaining({
      emailType: QUIZ_OPENING_WEEK_1H,
      status: "sent",
      resendId: "re_ok",
      meta: expect.objectContaining({
        source: "email-cron",
        cta: "join",
        has_profile: false,
        attempt: "auto",
        idempotency_key: "quiz_opening_week_1h/lead-1",
      }),
    }));
  });

  it("does not send again when already logged sent", async () => {
    mocks.hasEvent.mockResolvedValue(true);
    const result = await sendQuizOpeningWeek1hEmail(env, {
      email: "mama@example.com",
      lead: { id: "lead-1" },
    });
    expect(result).toEqual({ ok: false, skipped: "already_sent" });
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it("logs a failed event when Resend returns error", async () => {
    mocks.resend.mockResolvedValue({
      data: null,
      error: { message: "rate limited", statusCode: 429 },
    });
    const result = await sendQuizOpeningWeek1hEmail(env, {
      email: "mama@example.com",
      firstName: "Dolly",
      lead: { id: "lead-1", segment: "main" },
      profile: { id: "p-unpaid", paid: false },
      source: "quiz-opening-week-1h-backfill",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/rate limited/);
    expect(mocks.log).toHaveBeenCalledWith(env, expect.objectContaining({
      emailType: QUIZ_OPENING_WEEK_1H,
      status: "failed",
      meta: expect.objectContaining({
        attempt: "backfill",
        cta: "checkout",
        has_profile: true,
        error: "rate limited",
      }),
    }));
  });
});
