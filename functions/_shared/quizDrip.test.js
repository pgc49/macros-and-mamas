import { describe, expect, it } from "vitest";
import {
  ANCHOR_FALLBACK_MS,
  DAY_MS,
  QUIZ_DRIP_1D,
  QUIZ_DRIP_3D,
  QUIZ_DRIP_7D,
  QUIZ_PREGNANCY_NOTE,
  decideQuizDripAction,
  indexEmailEvents,
  indexProfilesByEmail,
  pickDueQuizDripStep,
  planQuizLeadSends,
  quizDripAnchorMs,
} from "./quizDrip.mjs";
import {
  buildPregnancyNoteBody,
  buildQuizDrip1Body,
  buildQuizDrip3Body,
  buildQuizDrip7Body,
  formatStoredBands,
  quizDripSubject,
} from "./quizDripEmail.mjs";
import { COHORT_SHORT, DOORS_CLOSE, EARLY_PRICE } from "./rangesEmail.mjs";

const NOW = Date.parse("2026-08-18T12:00:00.000Z");

function lead(over = {}) {
  return {
    email: "mama@example.com",
    first_name: "Dolly",
    segment: "main",
    created_at: new Date(NOW - 2 * DAY_MS).toISOString(),
    protein_low_g: 120,
    protein_high_g: 140,
    carbs_low_g: 160,
    carbs_high_g: 200,
    fat_low_g: 55,
    fat_high_g: 75,
    calories_low: 1800,
    calories_high: 2100,
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
  it("sends day 1 after 1 day and before day 3", () => {
    expect(pickDueQuizDripStep({
      ageMs: 1 * DAY_MS,
      sentTypes: new Set(),
      segment: "main",
    })).toBe(QUIZ_DRIP_1D);
    expect(pickDueQuizDripStep({
      ageMs: 2.9 * DAY_MS,
      sentTypes: new Set(),
      segment: "early_pp_nurture",
    })).toBe(QUIZ_DRIP_1D);
  });

  it("sends day 3 after 3 days and before day 7", () => {
    expect(pickDueQuizDripStep({
      ageMs: 3 * DAY_MS,
      sentTypes: new Set([QUIZ_DRIP_1D]),
      segment: "main",
    })).toBe(QUIZ_DRIP_3D);
    expect(pickDueQuizDripStep({
      ageMs: 6.9 * DAY_MS,
      sentTypes: new Set(),
      segment: "main",
    })).toBe(QUIZ_DRIP_3D);
  });

  it("sends day 7 after 7 days", () => {
    expect(pickDueQuizDripStep({
      ageMs: 7 * DAY_MS,
      sentTypes: new Set([QUIZ_DRIP_1D, QUIZ_DRIP_3D]),
      segment: "main",
    })).toBe(QUIZ_DRIP_7D);
  });

  it("does not send before day 1", () => {
    expect(pickDueQuizDripStep({
      ageMs: 20 * 60 * 60 * 1000,
      sentTypes: new Set(),
      segment: "main",
    })).toBeNull();
  });

  it("skips a missed earlier step so a late cron does not dump 1+3+7", () => {
    expect(pickDueQuizDripStep({
      ageMs: 8 * DAY_MS,
      sentTypes: new Set(),
      segment: "main",
    })).toBe(QUIZ_DRIP_7D);
  });

  it("does not resend an already-sent step", () => {
    expect(pickDueQuizDripStep({
      ageMs: 1.5 * DAY_MS,
      sentTypes: new Set([QUIZ_DRIP_1D]),
      segment: "main",
    })).toBeNull();
    expect(pickDueQuizDripStep({
      ageMs: 4 * DAY_MS,
      sentTypes: new Set([QUIZ_DRIP_3D]),
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

  it("stops when a profile exists so finish-joining owns them", () => {
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
      sentTypes: new Set(["quiz_ranges", QUIZ_DRIP_1D]),
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
  it("plans a day-1 send for an unpaid main lead", () => {
    const email = "mama@example.com";
    const { plans, skipped } = planQuizLeadSends({
      now: NOW,
      leads: [lead()],
      profileByEmail: new Map(),
      eventsByEmail: indexEmailEvents([{
        to_email: email,
        email_type: "quiz_ranges",
        created_at: new Date(NOW - 26 * 60 * 60 * 1000).toISOString(),
      }]),
      unsubscribedEmails: new Set(),
    });
    expect(plans).toEqual([expect.objectContaining({ email, step: QUIZ_DRIP_1D })]);
    expect(skipped.unsubscribed || 0).toBe(0);
  });

  it("indexes paid profiles by email", () => {
    const map = indexProfilesByEmail([
      { email: "Mama@example.com", paid: false },
      { email: "mama@example.com", paid: true, paid_at: "2026-08-01" },
    ]);
    expect(map.get("mama@example.com").paid).toBe(true);
  });
});

describe("quiz drip copy", () => {
  it("day 1 recaps stored bands and keeps the $249 offer helpers", () => {
    const bands = formatStoredBands(lead());
    const html = buildQuizDrip1Body({
      bands,
      joinUrl: "https://www.macrosandmamas.com/join?from=quiz&email=mama%40example.com",
    });
    expect(html).toContain("120–140 g");
    expect(html).toContain(`$${EARLY_PRICE}`);
    expect(html).toContain(DOORS_CLOSE);
    expect(html).toContain(COHORT_SHORT);
    expect(html).not.toMatch(/—/);
  });

  it("day 3 is first-person and not a numbers dump", () => {
    const html = buildQuizDrip3Body();
    expect(html).toMatch(/weekly check-in/i);
    expect(html).not.toMatch(/Protein:/);
    expect(html).not.toMatch(/\$249/);
    expect(html).not.toMatch(/—/);
  });

  it("day 7 reuses the centralized offer / doors copy", () => {
    const html = buildQuizDrip7Body({
      joinUrl: "https://www.macrosandmamas.com/join?from=quiz&email=x",
    });
    expect(html).toContain("Last note from me on this");
    expect(html).toContain(DOORS_CLOSE);
    expect(html).toContain(`$${EARLY_PRICE}`);
    expect(quizDripSubject(QUIZ_DRIP_7D, "Dolly")).toBe("Dolly, still want in?");
  });

  it("pregnancy note has no checkout hard-sell", () => {
    const html = buildPregnancyNoteBody();
    expect(html).toMatch(/light note/i);
    expect(html).not.toMatch(/\$249|lock in|Finish signing up|\/join/i);
    expect(html).not.toMatch(/—/);
  });
});
