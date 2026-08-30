import { describe, expect, it } from "vitest";
import { buildHomeQueue, isHotLeftover, leftoverInPlayCount, newLeftoverLastHours, pipelineCounts } from "./homeQueue.js";

const TODAY = "2026-08-30";
const NOW = Date.parse("2026-08-30T18:00:00.000Z");

const leftover = (over = {}) => ({
  leftover: true,
  snoozed: false,
  stage: "nudging",
  emailLower: "lead@example.com",
  lastTouchAt: null,
  remainingDrips: [{ emailType: "quiz_drip_2d" }, { emailType: "quiz_drip_7d" }],
  lead: { created_at: "2026-08-28T00:00:00.000Z" },
  client: null,
  ...over,
});

const clientPerson = (over = {}) => ({
  leftover: false,
  snoozed: false,
  stage: "active",
  emailLower: "mama@example.com",
  profileId: "p1",
  client: {
    id: "p1",
    role: "client",
    stage: "active",
    status: "active",
    paid: true,
    unreadFromMama: 0,
    lastActiveDate: "2026-08-28",
    lastAdminAt: "2026-08-20T00:00:00.000Z",
  },
  ...over,
});

describe("isHotLeftover", () => {
  it("is hot after 24h with no touch", () => {
    expect(isHotLeftover(leftover(), NOW)).toBe(true);
    expect(isHotLeftover(leftover({ lastTouchAt: NOW - 60 * 60 * 1000 }), NOW)).toBe(false);
    expect(isHotLeftover(leftover({ snoozed: true }), NOW)).toBe(false);
  });
});

describe("buildHomeQueue", () => {
  it("ranks unread and approval clients via attentionRank, then leftover", () => {
    const unread = clientPerson({
      profileId: "u",
      emailLower: "u@example.com",
      client: {
        id: "u",
        role: "client",
        stage: "active",
        status: "active",
        paid: true,
        unreadFromMama: 2,
        lastActiveDate: TODAY,
        lastAdminAt: "2026-08-29T00:00:00.000Z",
      },
    });
    const approve = clientPerson({
      profileId: "a",
      emailLower: "a@example.com",
      stage: "paid_needs_setup",
      client: {
        id: "a",
        role: "client",
        stage: "awaiting_approval",
        status: "pending",
        paid: true,
        hasIntake: true,
        unreadFromMama: 0,
        lastActiveDate: null,
        lastAdminAt: "",
      },
    });
    const rows = buildHomeQueue({
      people: [leftover(), unread, approve],
      todayIso: TODAY,
      now: NOW,
    });
    expect(rows[0].reason).toMatch(/unread/i);
    expect(rows[1].reason).toMatch(/approval/);
    expect(rows.some((r) => r.kind === "lead")).toBe(true);
  });

  it("drops snoozed people", () => {
    const rows = buildHomeQueue({
      people: [leftover({ snoozed: true }), clientPerson({ snoozed: true })],
      todayIso: TODAY,
      now: NOW,
    });
    expect(rows).toEqual([]);
  });
});

describe("pipeline + leftover counts", () => {
  it("counts leftover in play and pipeline buckets", () => {
    const people = [
      leftover(),
      leftover({ emailLower: "cold@x.com", stage: "cold", leftover: true }),
      clientPerson({ stage: "active" }),
      clientPerson({
        emailLower: "setup@x.com",
        stage: "paid_needs_setup",
        client: { role: "client", stage: "awaiting_approval", paid: true },
      }),
    ];
    expect(leftoverInPlayCount(people)).toBe(1);
    expect(pipelineCounts(people)).toEqual({ inPlay: 1, settingUp: 1, active: 1 });
  });

  it("lists leftover created in the last 24 hours", () => {
    const fresh = leftover({
      emailLower: "fresh@x.com",
      lead: { created_at: "2026-08-30T10:00:00.000Z" },
    });
    const old = leftover({
      emailLower: "old@x.com",
      lead: { created_at: "2026-08-28T00:00:00.000Z" },
    });
    expect(newLeftoverLastHours([fresh, old], NOW).map((p) => p.emailLower)).toEqual(["fresh@x.com"]);
  });

  it("counts nurture leftover as still in play, not cold", () => {
    expect(leftoverInPlayCount([
      leftover({
        emailLower: "preg@x.com",
        stage: "leftover",
        leftover: true,
        nurtureTags: ["Pregnant"],
      }),
    ])).toBe(1);
  });
});
