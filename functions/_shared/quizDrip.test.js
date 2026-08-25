import { describe, expect, it } from "vitest";
import {
  ANCHOR_FALLBACK_MS,
  DAY_MS,
  QUIZ_DRIP_2D,
  QUIZ_DRIP_7D,
  QUIZ_LAST_MIN_AGE_MS,
  QUIZ_PREGNANCY_NOTE,
  decideQuizDripAction,
  indexEmailEvents,
  indexProfilesByEmail,
  pickDueQuizDripStep,
  planQuizLeadSends,
  planRemainingQuizDrips,
  quizDripAnchorMs,
  quizLastSalesDue,
} from "./quizDrip.mjs";
import {
  COTI_NURSING_QUOTE,
  buildPregnancyNoteBody,
  buildQuizDrip2Body,
  buildQuizDrip7Body,
  quizDripSubject,
} from "./quizDripEmail.mjs";
import { COHORT_SHORT, DOORS_CLOSE, EARLY_PRICE, SPLIT_AT_CHECKOUT } from "./rangesEmail.mjs";

const NOW = Date.parse("2026-08-18T12:00:00.000Z");

function lead(over = {}) {
  return {
    email: "mama@example.com",
    first_name: "Dolly",
    segment: "main",
    created_at: new Date(NOW - 2 * DAY_MS).toISOString(),
    ...over,
  };
}

function decide(over = {}) {
  return decideQuizDripAction({
    now: NOW,
    lead: lead(),
    quizRangesAt: NOW - 2 * DAY_MS,
    sentTypes: new Set(["quiz_ranges"]),
    ...over,
  });
}

describe("pickDueQuizDripStep timing", () => {
  it("does not send a day-1 recap", () => {
    expect(pickDueQuizDripStep({
      ageMs: 1 * DAY_MS,
      sentTypes: new Set(),
      segment: "main",
    })).toBeNull();
    expect(pickDueQuizDripStep({
      ageMs: 26 * 60 * 60 * 1000,
      sentTypes: new Set(),
      segment: "early_pp_nurture",
    })).toBeNull();
  });

  it("sends the Callie note after 2 days and before the last step", () => {
    expect(pickDueQuizDripStep({
      ageMs: 2 * DAY_MS,
      sentTypes: new Set(),
      segment: "main",
    })).toBe(QUIZ_DRIP_2D);
    expect(pickDueQuizDripStep({
      ageMs: 5.9 * DAY_MS,
      sentTypes: new Set(),
      segment: "early_pp_nurture",
    })).toBe(QUIZ_DRIP_2D);
  });

  it("sends the last sales email at +6 days", () => {
    expect(QUIZ_LAST_MIN_AGE_MS).toBe(6 * DAY_MS);
    expect(pickDueQuizDripStep({
      ageMs: 6 * DAY_MS,
      sentTypes: new Set([QUIZ_DRIP_2D]),
      segment: "main",
    })).toBe(QUIZ_DRIP_7D);
  });

  it("makes last due on Aug 26 PT even before +6 days, and never on Aug 27 PT", () => {
    const aug26 = Date.parse("2026-08-26T18:00:00.000-07:00");
    const aug27 = Date.parse("2026-08-27T00:30:00.000-07:00");
    expect(quizLastSalesDue({ ageMs: 5 * DAY_MS, now: aug26 })).toBe(true);
    expect(pickDueQuizDripStep({
      ageMs: 2 * DAY_MS,
      sentTypes: new Set(),
      segment: "main",
      now: aug26,
    })).toBe(QUIZ_DRIP_7D);
    expect(quizLastSalesDue({ ageMs: 7 * DAY_MS, now: aug27 })).toBe(false);
    expect(pickDueQuizDripStep({
      ageMs: 7 * DAY_MS,
      sentTypes: new Set(),
      segment: "main",
      now: aug27,
    })).toBe(QUIZ_DRIP_2D);
  });

  it("skips a missed earlier step so a late cron does not dump 2+7", () => {
    expect(pickDueQuizDripStep({
      ageMs: 8 * DAY_MS,
      sentTypes: new Set(),
      segment: "main",
    })).toBe(QUIZ_DRIP_7D);
  });

  it("does not resend an already-sent step", () => {
    expect(pickDueQuizDripStep({
      ageMs: 3 * DAY_MS,
      sentTypes: new Set([QUIZ_DRIP_2D]),
      segment: "main",
    })).toBeNull();
    expect(pickDueQuizDripStep({
      ageMs: 8 * DAY_MS,
      sentTypes: new Set([QUIZ_DRIP_7D]),
      segment: "main",
    })).toBeNull();
  });
});

describe("decideQuizDripAction stop conditions", () => {
  it("stops when paid on a matching profile", () => {
    expect(decide({ profile: { email: "mama@example.com", paid: true } }).reason).toBe("paid");
    expect(decide({
      profile: { email: "mama@example.com", paid: false, paid_at: "2026-08-17T00:00:00.000Z" },
    }).reason).toBe("paid");
    expect(decide({ sentTypes: new Set(["quiz_ranges", "welcome"]) }).reason).toBe("paid");
  });

  it("stops the quiz drip the moment a profiles row exists (Track B)", () => {
    expect(decide({ profile: { email: "mama@example.com", paid: false } }).reason).toBe("has_profile");
    expect(decide({
      sentTypes: new Set(["quiz_ranges", "finish_joining_1h"]),
    }).reason).toBe("has_profile");
  });

  it("stops when unsubscribed", () => {
    expect(decide({ unsubscribed: true }).reason).toBe("unsubscribed");
  });

  it("does not put plant-based or pregnancy on the sales drip", () => {
    expect(decide({ lead: lead({ segment: "waitlist_plantbased" }) }).reason)
      .toBe("waitlist_plantbased");
    expect(decide({
      lead: lead({ segment: "pregnancy_nurture" }),
      quizRangesAt: NOW - 2 * DAY_MS,
    }).reason).toBe("not_due");
    expect(decide({
      lead: lead({ segment: "pregnancy_nurture" }),
      quizRangesAt: NOW - 3 * DAY_MS,
    })).toEqual(expect.objectContaining({
      action: "send",
      step: QUIZ_PREGNANCY_NOTE,
    }));
  });

  it("does not restart after a re-quiz: first quiz_ranges timestamp stays the clock", () => {
    const first = NOW - 2 * DAY_MS;
    const decision = decide({
      lead: lead({ created_at: new Date(NOW - 60 * 60 * 1000).toISOString() }),
      quizRangesAt: first,
      sentTypes: new Set(["quiz_ranges", QUIZ_DRIP_2D]),
    });
    expect(decision.action).toBe("skip");
    expect(decision.reason).toBe("not_due");
  });

  it("skips historical leads with no quiz_ranges log", () => {
    expect(decide({
      lead: lead({ created_at: new Date(NOW - ANCHOR_FALLBACK_MS - DAY_MS).toISOString() }),
      quizRangesAt: null,
      sentTypes: new Set(),
    }).reason).toBe("no_anchor");
  });
});

describe("quizDripAnchorMs", () => {
  it("prefers the first quiz_ranges send over lead created_at", () => {
    const created = NOW - 10 * DAY_MS;
    const ranges = NOW - 2 * DAY_MS;
    expect(quizDripAnchorMs({
      leadCreatedAt: created,
      quizRangesAt: ranges,
      now: NOW,
    })).toBe(ranges);
  });
});

describe("planQuizLeadSends", () => {
  it("plans a +2d send for an unpaid quiz-only lead", () => {
    const email = "mama@example.com";
    const { plans } = planQuizLeadSends({
      now: NOW,
      leads: [lead()],
      profileByEmail: new Map(),
      eventsByEmail: indexEmailEvents([{
        to_email: email,
        email_type: "quiz_ranges",
        created_at: new Date(NOW - 2 * DAY_MS).toISOString(),
      }]),
      unsubscribedEmails: new Set(),
    });
    expect(plans).toEqual([expect.objectContaining({ email, step: QUIZ_DRIP_2D })]);
  });

  it("does not plan quiz drip when the same email has a profile", () => {
    const email = "mama@example.com";
    const { plans, skipped } = planQuizLeadSends({
      now: NOW,
      leads: [lead()],
      profileByEmail: new Map([[email, { email, paid: false }]]),
      eventsByEmail: indexEmailEvents([{
        to_email: email,
        email_type: "quiz_ranges",
        created_at: new Date(NOW - 2 * DAY_MS).toISOString(),
      }]),
      unsubscribedEmails: new Set(),
    });
    expect(plans).toEqual([]);
    expect(skipped.has_profile).toBe(1);
  });

  it("indexes paid profiles by email", () => {
    const map = indexProfilesByEmail([
      { email: "Mama@example.com", paid: false },
      { email: "mama@example.com", paid: true, paid_at: "2026-08-01" },
    ]);
    expect(map.get("mama@example.com").paid).toBe(true);
  });
});

describe("planRemainingQuizDrips", () => {
  it("lists +2d then last after ranges, and marks a due step as due", () => {
    const rangesAt = Date.parse("2026-08-20T12:00:00.000Z");
    const now = Date.parse("2026-08-21T18:00:00.000Z");
    const planned = planRemainingQuizDrips({
      now,
      lead: lead({
        segment: "main",
        created_at: new Date(rangesAt).toISOString(),
      }),
      sentTypes: new Set(["quiz_ranges"]),
      quizRangesAt: rangesAt,
    });
    expect(planned.stopReason).toBeNull();
    expect(planned.remaining.map((r) => r.emailType)).toEqual([QUIZ_DRIP_2D, QUIZ_DRIP_7D]);
    expect(planned.remaining[0]).toEqual(expect.objectContaining({
      emailType: QUIZ_DRIP_2D,
      atMs: rangesAt + 2 * DAY_MS,
      due: false,
    }));
  });

  it("shows the +2d as due now when cron has not sent it yet", () => {
    const rangesAt = NOW - 2 * DAY_MS;
    const planned = planRemainingQuizDrips({
      now: NOW,
      lead: lead({ created_at: new Date(rangesAt).toISOString() }),
      sentTypes: new Set(["quiz_ranges"]),
      quizRangesAt: rangesAt,
    });
    expect(planned.remaining[0]).toEqual(expect.objectContaining({
      emailType: QUIZ_DRIP_2D,
      due: true,
    }));
  });

  it("returns no remaining when unsubscribed, paid, or plant-based", () => {
    const args = {
      now: NOW,
      lead: lead(),
      sentTypes: new Set(["quiz_ranges"]),
      quizRangesAt: NOW - DAY_MS,
    };
    expect(planRemainingQuizDrips({ ...args, unsubscribed: true }).stopReason).toBe("unsubscribed");
    expect(planRemainingQuizDrips({
      ...args,
      profile: { paid: true },
    }).remaining).toEqual([]);
    expect(planRemainingQuizDrips({
      ...args,
      lead: lead({ segment: "waitlist_plantbased" }),
    }).stopReason).toBe("waitlist_plantbased");
  });
});

describe("quiz drip copy", () => {
  it("day 2 is first-person and not a numbers dump", () => {
    const html = buildQuizDrip2Body();
    expect(html).toMatch(/weekly check-in/i);
    expect(html).not.toMatch(/Protein:/);
    expect(html).toContain("Doors close Aug 27");
    expect(html).toContain("Monday, Aug 31");
    expect(html).toContain("$249");
    expect(html).not.toMatch(/—/);
    expect(quizDripSubject(QUIZ_DRIP_2D, "Dolly")).toBe("Dolly, the numbers are the easy part");
  });

  it("day 7 leads with the bridge, Coti's quote, then the offer", () => {
    const html = buildQuizDrip7Body({
      joinUrl: "https://www.macrosandmamas.com/join?from=quiz&email=x",
    });
    expect(html).toContain("The ranges I sent you are the easy part.");
    expect(html).toContain("when milk, sleep, and appetite change");
    expect(html).toContain(COTI_NURSING_QUOTE);
    expect(html).toContain("Doors close tomorrow night.");
    expect(html).toContain(DOORS_CLOSE);
    expect(html).toContain(COHORT_SHORT);
    expect(html).toContain(SPLIT_AT_CHECKOUT);
    expect(html).not.toMatch(/capped at 50/);
    expect(html).toContain(`$${EARLY_PRICE}`);
    expect(html.replace(COTI_NURSING_QUOTE, "")).not.toMatch(/—/);
    expect(html).not.toMatch(/!/);
    expect(quizDripSubject(QUIZ_DRIP_7D, "Dolly")).toBe("Dolly, still want in?");
  });

  it("pregnancy note has no checkout hard-sell", () => {
    const html = buildPregnancyNoteBody();
    expect(html).toMatch(/light note/i);
    expect(html).not.toMatch(/\$249|lock in|Finish signing up|\/join/i);
    expect(html).not.toMatch(/—/);
  });

  it("uses subjects that will not thread under the first ranges email", () => {
    const firsts = [
      "Your ranges, Dolly",
      "Dolly, a note for this season",
    ];
    const followUps = [
      quizDripSubject(QUIZ_DRIP_2D, "Dolly"),
      quizDripSubject(QUIZ_DRIP_7D, "Dolly"),
      quizDripSubject(QUIZ_PREGNANCY_NOTE, "Dolly"),
    ];
    for (const subject of followUps) {
      expect(subject).not.toMatch(/your ranges/i);
      expect(firsts).not.toContain(subject);
    }
  });
});
