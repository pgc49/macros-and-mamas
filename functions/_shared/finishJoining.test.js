import { describe, expect, it } from "vitest";
import {
  FINISH_JOINING_1H,
  FINISH_JOINING_24H,
  FINISH_JOINING_CLOSE,
  HOUR_MS,
  decideFinishJoiningAction,
  pickDueFinishJoiningStep,
  planRemainingFinishJoining,
} from "./finishJoining.mjs";
import {
  buildFinishJoining24hBody,
  buildFinishJoining1hBody,
  buildFinishJoiningCloseBody,
  buildFinishJoiningPayload,
  finishJoinUrl,
  finishJoiningCloseSubject,
  finishJoiningSubject,
} from "./finishJoiningEmail.mjs";

const AUG25 = Date.parse("2026-08-25T18:00:00.000-07:00");
const AUG26 = Date.parse("2026-08-26T18:00:00.000-07:00");
const AUG27 = Date.parse("2026-08-27T00:30:00.000-07:00");

describe("pickDueFinishJoiningStep", () => {
  it("keeps +1h then +24h before Wednesday", () => {
    expect(pickDueFinishJoiningStep({
      ageMs: 1 * HOUR_MS,
      sentTypes: new Set(),
      now: AUG25,
    })).toBe(FINISH_JOINING_1H);
    expect(pickDueFinishJoiningStep({
      ageMs: 24 * HOUR_MS,
      sentTypes: new Set([FINISH_JOINING_1H]),
      now: AUG25,
    })).toBe(FINISH_JOINING_24H);
  });

  it("prefers the Aug 26 last note when it is also due", () => {
    expect(pickDueFinishJoiningStep({
      ageMs: 2 * HOUR_MS,
      sentTypes: new Set(),
      now: AUG26,
    })).toBe(FINISH_JOINING_CLOSE);
    expect(pickDueFinishJoiningStep({
      ageMs: 30 * HOUR_MS,
      sentTypes: new Set([FINISH_JOINING_1H]),
      now: AUG26,
    })).toBe(FINISH_JOINING_CLOSE);
  });

  it("does not send the last note on or after Aug 27 PT", () => {
    expect(pickDueFinishJoiningStep({
      ageMs: 30 * HOUR_MS,
      sentTypes: new Set([FINISH_JOINING_1H]),
      now: AUG27,
    })).toBe(FINISH_JOINING_24H);
    expect(pickDueFinishJoiningStep({
      ageMs: 2 * HOUR_MS,
      sentTypes: new Set(),
      now: AUG27,
    })).toBe(FINISH_JOINING_1H);
  });

  it("stops after the last note has been sent", () => {
    expect(pickDueFinishJoiningStep({
      ageMs: 48 * HOUR_MS,
      sentTypes: new Set([FINISH_JOINING_CLOSE]),
      now: AUG26,
    })).toBeNull();
  });
});

describe("decideFinishJoiningAction", () => {
  const unpaid = {
    id: "p1",
    email: "mama@example.com",
    paid: false,
    created_at: new Date(AUG25 - 2 * HOUR_MS).toISOString(),
  };

  it("skips paid, unsubscribed, and closed enrollment", () => {
    expect(decideFinishJoiningAction({
      now: AUG25,
      profile: { ...unpaid, paid: true },
    }).reason).toBe("paid");
    expect(decideFinishJoiningAction({
      now: AUG25,
      profile: unpaid,
      unsubscribed: true,
    }).reason).toBe("unsubscribed");
    expect(decideFinishJoiningAction({
      now: AUG25,
      profile: unpaid,
      nudgeAllowed: false,
    }).reason).toBe("enrollment_closed");
  });

  it("lists remaining +1h / +24h / close before Wednesday", () => {
    const created = Date.parse("2026-08-24T12:00:00.000-07:00");
    const planned = planRemainingFinishJoining({
      now: created + 10 * 60 * 1000,
      profile: { ...unpaid, created_at: new Date(created).toISOString(), paid: false },
      sentTypes: new Set(),
    });
    expect(planned.remaining.map((r) => r.emailType)).toEqual([
      FINISH_JOINING_1H,
      FINISH_JOINING_24H,
      FINISH_JOINING_CLOSE,
    ]);
  });

  it("returns no remaining when paid or unsubscribed", () => {
    expect(planRemainingFinishJoining({
      now: AUG25,
      profile: { ...unpaid, paid: true },
    })).toEqual(expect.objectContaining({ remaining: [], stopReason: "paid" }));
    expect(planRemainingFinishJoining({
      now: AUG25,
      profile: unpaid,
      unsubscribed: true,
    }).stopReason).toBe("unsubscribed");
  });

  it("plans the Wednesday last note for an unpaid profile", () => {
    expect(decideFinishJoiningAction({
      now: AUG26,
      profile: unpaid,
      sentTypes: new Set(),
    })).toEqual(expect.objectContaining({
      action: "send",
      step: FINISH_JOINING_CLOSE,
    }));
  });
});

describe("finish joining copy", () => {
  it("uses the approved 1h and 24h bodies without WhatsApp or em dashes", () => {
    const one = buildFinishJoining1hBody();
    const two = buildFinishJoining24hBody();
    expect(one).toContain("You started joining Macros and Mamas. I'm glad you're here.");
    expect(one).toContain("our group Mon through Fri");
    expect(one).toContain("We start Aug 31. Doors close Aug 27.");
    expect(one).not.toMatch(/\$249/);
    expect(two).toContain("I'd still love to have you in this group.");
    expect(two).toContain("macros built by me, not a calculator");
    expect(two).not.toMatch(/No pressure either way/);
    for (const html of [one, two]) {
      expect(html).not.toMatch(/whatsapp/i);
      expect(html).not.toMatch(/—/);
      expect(html).not.toMatch(/capped at 50/i);
    }
    expect(finishJoiningSubject("1h", "Dolly")).toBe("Your spot's waiting, mama");
  });

  it("adds the $249 line only when quiz unlock is true", () => {
    expect(buildFinishJoining1hBody({ quizUnlock: true })).toContain("Your quiz rate is $249.");
    expect(buildFinishJoining24hBody({ quizUnlock: true })).toContain("Your quiz rate is $249.");
    expect(buildFinishJoiningCloseBody({ quizUnlock: true })).toContain("Your quiz rate is $249.");
    expect(buildFinishJoiningCloseBody()).not.toMatch(/\$249/);
  });

  it("builds the Wednesday last note with a safe first-name subject", () => {
    const html = buildFinishJoiningCloseBody();
    expect(html).toContain("Last note from me. Doors close Aug 27. We start Monday.");
    expect(html).toContain("If something's unclear, reply. I read everything.");
    expect(html).not.toMatch(/—/);
    expect(finishJoiningCloseSubject("Dolly Chammas")).toBe("Dolly, last note from me");
    expect(finishJoiningCloseSubject("")).toBe("Mama, last note from me");
  });

  it("prefills /join?email= and keeps the comma CTA", () => {
    const payload = buildFinishJoiningPayload({
      variant: "close",
      name: "Dolly",
      email: "Mama@example.com",
    });
    expect(payload.cta_url).toBe(finishJoinUrl("Mama@example.com"));
    expect(payload.cta_url).toMatch(/\/join\?email=mama%40example.com/);
    expect(payload.cta_url).not.toMatch(/from=quiz/);
    expect(payload.cta_text).toBe("Finish signing up, lock in your spot");
    expect(payload.emailType).toBe(FINISH_JOINING_CLOSE);
  });
});
