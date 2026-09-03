import { describe, expect, it } from "vitest";
import { indexEmailEvents, indexProfilesByEmail } from "./quizDrip.mjs";
import {
  BACKFILL_CONFIRM,
  HOUR_MS,
  QUIZ_OPENING_WEEK_1H,
  QUIZ_OPENING_WEEK_1H_LOOKBACK_MS,
  QUIZ_OPENING_WEEK_1H_MIN_AGE_MS,
  backfillWillSend,
  decideQuizOpeningWeek1h,
  openingWeekIdempotencyKey,
  parseBackfillEmails,
  planQuizOpeningWeekSends,
  planRemainingOpeningWeek1h,
} from "./quizOpeningWeek1h.mjs";
import {
  OPENING_WEEK_1H_CHECKOUT_CTA,
  OPENING_WEEK_1H_JOIN_CTA,
  buildOpeningWeek1hBody,
  buildOpeningWeek1hPayload,
  openingWeek1hPreviewText,
  openingWeek1hSubject,
} from "./quizOpeningWeek1hEmail.mjs";

const NOW = Date.parse("2026-09-03T18:00:00.000Z");

function lead(over = {}) {
  return {
    id: "lead-1",
    email: "mama@example.com",
    first_name: "Dolly",
    segment: "main",
    created_at: new Date(NOW - 2 * HOUR_MS).toISOString(),
    ...over,
  };
}

function decide(over = {}) {
  return decideQuizOpeningWeek1h({
    now: NOW,
    lead: lead(),
    quizRangesAt: NOW - 2 * HOUR_MS,
    sentTypes: new Set(["quiz_ranges"]),
    mode: "cron",
    ...over,
  });
}

describe("quiz_opening_week_1h timing boundary", () => {
  it("does not send before +1 hour after ranges", () => {
    expect(decide({ quizRangesAt: NOW - QUIZ_OPENING_WEEK_1H_MIN_AGE_MS + 1 }).action).toBe("skip");
    expect(decide({ quizRangesAt: NOW - QUIZ_OPENING_WEEK_1H_MIN_AGE_MS + 1 }).reason).toBe("not_due");
  });

  it("sends at exactly +1 hour", () => {
    expect(decide({ quizRangesAt: NOW - QUIZ_OPENING_WEEK_1H_MIN_AGE_MS })).toEqual(
      expect.objectContaining({
        action: "send",
        step: QUIZ_OPENING_WEEK_1H,
        cta: "join",
      }),
    );
  });

  it("retries inside the recovery lookback and skips after it on cron", () => {
    const stillIn = NOW - QUIZ_OPENING_WEEK_1H_MIN_AGE_MS - QUIZ_OPENING_WEEK_1H_LOOKBACK_MS;
    expect(decide({ quizRangesAt: stillIn }).action).toBe("send");
    expect(decide({ quizRangesAt: stillIn - 1 }).reason).toBe("outside_lookback");
  });

  it("backfill ignores the cron lookback once +1h has passed", () => {
    const old = NOW - 36 * HOUR_MS;
    expect(decide({ quizRangesAt: old, mode: "backfill" }).action).toBe("send");
    expect(decide({ quizRangesAt: old, mode: "cron" }).reason).toBe("outside_lookback");
  });
});

describe("quiz_opening_week_1h Track A only", () => {
  it("skips pregnancy and plant-based", () => {
    expect(decide({ lead: lead({ segment: "pregnancy_nurture" }) }).reason).toBe("not_sales_segment");
    expect(decide({ lead: lead({ segment: "waitlist_plantbased" }) }).reason).toBe("waitlist_plantbased");
    expect(decide({ lead: lead({ segment: "early_pp_nurture" }) }).action).toBe("send");
  });
});

describe("quiz_opening_week_1h suppression", () => {
  it("suppresses paid, not merely because an account exists", () => {
    expect(decide({ profile: { email: "mama@example.com", paid: true } }).reason).toBe("paid");
    expect(decide({
      profile: { email: "mama@example.com", paid: false, paid_at: "2026-09-03T00:00:00.000Z" },
    }).reason).toBe("paid");
    expect(decide({ sentTypes: new Set(["quiz_ranges", "welcome"]) }).reason).toBe("paid");
    expect(decide({ profile: { email: "mama@example.com", paid: false, id: "p-unpaid" } })).toEqual(
      expect.objectContaining({ action: "send", cta: "checkout", hasProfile: true }),
    );
  });

  it("suppresses unsubscribed", () => {
    expect(decide({ unsubscribed: true }).reason).toBe("unsubscribed");
  });

  it("is idempotent once sent", () => {
    expect(decide({
      sentTypes: new Set(["quiz_ranges", QUIZ_OPENING_WEEK_1H]),
    }).reason).toBe("already_sent");
  });

  it("requires a sent quiz_ranges clock", () => {
    expect(decide({ quizRangesAt: null }).reason).toBe("no_ranges");
  });
});

describe("planQuizOpeningWeekSends", () => {
  it("plans a no-account send and keeps account-unpaid eligible", () => {
    const rangesAt = new Date(NOW - 2 * HOUR_MS).toISOString();
    const { plans, skipped } = planQuizOpeningWeekSends({
      now: NOW,
      leads: [
        lead(),
        lead({ id: "lead-2", email: "signedup@example.com", first_name: "Signed" }),
        lead({ id: "lead-3", email: "paid@example.com", first_name: "Paid" }),
        lead({ id: "lead-4", email: "vegan@example.com", first_name: "Vegan", segment: "waitlist_plantbased" }),
      ],
      profileByEmail: indexProfilesByEmail([
        { email: "signedup@example.com", paid: false, id: "p-unpaid" },
        { email: "paid@example.com", paid: true, id: "p-paid" },
      ]),
      eventsByEmail: indexEmailEvents([
        { to_email: "mama@example.com", email_type: "quiz_ranges", created_at: rangesAt, status: "sent" },
        { to_email: "signedup@example.com", email_type: "quiz_ranges", created_at: rangesAt, status: "sent" },
        { to_email: "paid@example.com", email_type: "quiz_ranges", created_at: rangesAt, status: "sent" },
        { to_email: "vegan@example.com", email_type: "quiz_ranges", created_at: rangesAt, status: "sent" },
      ]),
      unsubscribedEmails: new Set(),
    });
    expect(plans.map((p) => [p.email, p.cta])).toEqual([
      ["mama@example.com", "join"],
      ["signedup@example.com", "checkout"],
    ]);
    expect(skipped.paid).toBe(1);
    expect(skipped.waitlist_plantbased).toBe(1);
  });

  it("allowlists backfill targets and re-checks eligibility", () => {
    const rangesAt = new Date(NOW - 36 * HOUR_MS).toISOString();
    const { plans, skipped } = planQuizOpeningWeekSends({
      now: NOW,
      mode: "backfill",
      allowlist: ["mama@example.com", "paid@example.com"],
      leads: [
        lead({ created_at: rangesAt }),
        lead({ id: "lead-3", email: "paid@example.com", created_at: rangesAt }),
        lead({ id: "lead-9", email: "other@example.com", created_at: rangesAt }),
      ],
      profileByEmail: indexProfilesByEmail([
        { email: "paid@example.com", paid: true },
      ]),
      eventsByEmail: indexEmailEvents([
        { to_email: "mama@example.com", email_type: "quiz_ranges", created_at: rangesAt, status: "sent" },
        { to_email: "paid@example.com", email_type: "quiz_ranges", created_at: rangesAt, status: "sent" },
        { to_email: "other@example.com", email_type: "quiz_ranges", created_at: rangesAt, status: "sent" },
      ]),
      unsubscribedEmails: new Set(),
    });
    expect(plans).toEqual([expect.objectContaining({ email: "mama@example.com" })]);
    expect(skipped.paid).toBe(1);
    expect(skipped.not_allowlisted).toBe(1);
  });
});

describe("backfill gate", () => {
  it("defaults to dry-run unless confirm matches", () => {
    expect(backfillWillSend({ dryRun: true, confirm: BACKFILL_CONFIRM })).toBe(false);
    expect(backfillWillSend({ dryRun: false, confirm: "SEND" })).toBe(false);
    expect(backfillWillSend({ dryRun: false, confirm: BACKFILL_CONFIRM })).toBe(true);
    expect(parseBackfillEmails([" Mama@Example.com ", "mama@example.com", "two@example.com"]))
      .toEqual(["mama@example.com", "two@example.com"]);
  });
});

describe("admin remaining", () => {
  it("lists +1h as upcoming before due, and hides it after lookback", () => {
    const upcoming = planRemainingOpeningWeek1h({
      now: NOW,
      lead: lead(),
      sentTypes: new Set(["quiz_ranges"]),
      quizRangesAt: NOW - 30 * 60 * 1000,
    });
    expect(upcoming.remaining[0]).toEqual(expect.objectContaining({
      emailType: QUIZ_OPENING_WEEK_1H,
      due: false,
    }));

    const stale = planRemainingOpeningWeek1h({
      now: NOW,
      lead: lead(),
      sentTypes: new Set(["quiz_ranges"]),
      quizRangesAt: NOW - 30 * HOUR_MS,
    });
    expect(stale.remaining).toEqual([]);
    expect(stale.stopReason).toBe("outside_lookback");
  });
});

describe("opening week copy", () => {
  it("uses the approved short note and distinct subject", () => {
    const html = buildOpeningWeek1hBody();
    expect(html).toMatch(/opening week is already underway/i);
    expect(html).toMatch(/join today so you don't miss more of the kickoff/i);
    expect(html).toMatch(/Questions\? Just reply\. It comes to me\./);
    expect(html).toContain("Macros and Mamas");
    expect(html).not.toMatch(/—/);
    expect(html).not.toMatch(/Doors close|Aug 27|Aug 31/);
    expect(openingWeek1hSubject("Dolly")).toBe("Dolly, opening week is underway");
    expect(openingWeek1hSubject("Dolly")).not.toMatch(/your ranges/i);
  });

  it("uses join vs finish-checkout CTAs and attribution", () => {
    const join = buildOpeningWeek1hPayload({
      firstName: "Dolly",
      email: "mama@example.com",
      hasProfile: false,
    });
    expect(join.cta_text).toBe(OPENING_WEEK_1H_JOIN_CTA);
    expect(join.cta_url).toMatch(/from=quiz/);
    expect(join.cta_url).toMatch(/utm_campaign=quiz_opening_week_1h/);
    expect(join.cta_url).toMatch(/email=mama%40example.com/);

    const checkout = buildOpeningWeek1hPayload({
      firstName: "Dolly",
      email: "mama@example.com",
      hasProfile: true,
    });
    expect(checkout.cta_text).toBe(OPENING_WEEK_1H_CHECKOUT_CTA);
    expect(checkout.cta_url).toMatch(/\/join\?email=mama%40example.com/);
    expect(checkout.cta_url).not.toMatch(/from=quiz/);
    expect(checkout.cta_url).toMatch(/utm_campaign=quiz_opening_week_1h/);
    expect(openingWeek1hPreviewText("Dolly", { hasProfile: true })).toMatch(/Finish checkout/);
  });

  it("keeps the event name distinct from quiz_drip_2d", () => {
    expect(QUIZ_OPENING_WEEK_1H).toBe("quiz_opening_week_1h");
    expect(QUIZ_OPENING_WEEK_1H).not.toBe("quiz_drip_2d");
    expect(openingWeekIdempotencyKey("lead-1")).toBe("quiz_opening_week_1h/lead-1");
  });
});
