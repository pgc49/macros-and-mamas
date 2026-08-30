import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  QUIZ_DRIP_2D,
  QUIZ_DRIP_7D,
  QUIZ_DRIP_7D_PAUSED,
  QUIZ_PREGNANCY_NOTE,
} from "../../functions/_shared/quizDrip.mjs";
import {
  dripStopCopy,
  nextDripLine,
  planLeadDrips,
  sentTypesFromEvents,
} from "./leadDripSchedule.js";

const NOW = Date.parse("2026-08-21T18:00:00.000Z");
const RANGES_AT = Date.parse("2026-08-20T12:00:00.000Z");

function quizLead(over = {}) {
  return {
    email: "dolly@example.com",
    first_name: "Dolly",
    segment: "main",
    created_at: new Date(RANGES_AT).toISOString(),
    profileId: null,
    funnelStatus: "quiz_only",
    ...over,
  };
}

function rangesEvent(over = {}) {
  return {
    id: "ranges",
    email_type: "quiz_ranges",
    to_email: "dolly@example.com",
    status: "sent",
    created_at: new Date(RANGES_AT).toISOString(),
    ...over,
  };
}

describe("sentTypesFromEvents", () => {
  it("counts sent only, so a failed drip stays scheduled", () => {
    const types = sentTypesFromEvents([
      rangesEvent(),
      { email_type: "quiz_drip_2d", status: "failed" },
    ]);
    expect([...types]).toEqual(["quiz_ranges"]);
  });
});

describe("planLeadDrips", () => {
  it("schedules the next quiz drip after ranges for a no-account lead", () => {
    const plan = planLeadDrips({
      now: NOW,
      lead: quizLead(),
      events: [rangesEvent()],
    });
    expect(plan.track).toBe("quiz");
    expect(plan.remaining[0]).toEqual(expect.objectContaining({
      emailType: QUIZ_DRIP_2D,
      atMs: RANGES_AT + 2 * DAY_MS,
      due: false,
    }));
    expect(plan.remaining.map((r) => r.emailType)).toEqual(
      QUIZ_DRIP_7D_PAUSED ? [QUIZ_DRIP_2D] : [QUIZ_DRIP_2D, QUIZ_DRIP_7D],
    );
    expect(nextDripLine(plan, NOW)).toMatch(/^Next: Quiz drip \(\+2d\) · /);
    expect(nextDripLine(plan, NOW)).not.toMatch(/Due now/);
  });

  it("marks a due-but-unsent drip as due now, not sent", () => {
    const rangesAt = NOW - 2 * DAY_MS;
    const plan = planLeadDrips({
      now: NOW,
      lead: quizLead({ created_at: new Date(rangesAt).toISOString() }),
      events: [rangesEvent({ created_at: new Date(rangesAt).toISOString() })],
    });
    expect(plan.remaining[0].due).toBe(true);
    expect(nextDripLine(plan, NOW)).toBe("Next: Quiz drip (+2d) · Due now");
  });

  it("shows no next drip when paid, unsubscribed, or the last send already went out", () => {
    expect(planLeadDrips({
      now: NOW,
      lead: quizLead({ profileId: "p1", funnelStatus: "paid", profileCreatedAt: new Date(NOW - DAY_MS).toISOString() }),
      events: [rangesEvent()],
    })).toEqual(expect.objectContaining({
      remaining: [],
      stopReason: "paid",
    }));
    expect(dripStopCopy("paid")).toBe("She already paid — no conversion drips.");

    expect(planLeadDrips({
      now: NOW,
      lead: quizLead(),
      events: [rangesEvent()],
      unsubscribed: true,
    }).stopReason).toBe("unsubscribed");

    const finished = planLeadDrips({
      now: NOW,
      lead: quizLead(),
      events: [
        rangesEvent(),
        { email_type: QUIZ_DRIP_2D, status: "sent" },
        { email_type: QUIZ_DRIP_7D, status: "sent" },
      ],
    });
    expect(finished.remaining).toEqual([]);
    expect(nextDripLine(finished, NOW)).toBe("No more drips scheduled");
  });

  it("does not advertise Track A drips for plant-based leftover", () => {
    const plan = planLeadDrips({
      now: NOW,
      lead: quizLead({ segment: "waitlist_plantbased" }),
      events: [rangesEvent()],
    });
    expect(plan.remaining).toEqual([]);
    expect(plan.stopReason).toBe("waitlist_plantbased");
    expect(dripStopCopy(plan.stopReason)).toBe("Plant-based — no sales drip.");
    expect(nextDripLine(plan, NOW)).toBe("No more drips scheduled");
    expect(plan.remaining.map((r) => r.emailType)).not.toContain(QUIZ_DRIP_2D);
    expect(plan.remaining.map((r) => r.emailType)).not.toContain(QUIZ_DRIP_7D);
  });

  it("schedules the pregnancy note only — not the $249 Track A sequence", () => {
    const plan = planLeadDrips({
      now: NOW,
      lead: quizLead({ segment: "pregnancy_nurture" }),
      events: [rangesEvent()],
    });
    expect(plan.remaining.map((r) => r.emailType)).toEqual([QUIZ_PREGNANCY_NOTE]);
    expect(plan.remaining.map((r) => r.emailType)).not.toContain(QUIZ_DRIP_2D);
    expect(plan.remaining.map((r) => r.emailType)).not.toContain(QUIZ_DRIP_7D);
    expect(nextDripLine(plan, NOW)).toMatch(/Quiz pregnancy note/);
    expect(nextDripLine(plan, NOW)).not.toMatch(/Quiz drip/);
  });
});
