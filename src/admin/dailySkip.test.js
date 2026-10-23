import { beforeEach, describe, expect, it } from "vitest";
import { filterRoster } from "./clientRoster.js";
import {
  boardReason,
  canPassToday,
  clearLocalSkip,
  endOfLocalDay,
  isPassedQuietToday,
  listPassedToday,
  loadLocalSkips,
  mergeOverrideRows,
  skipIsBroken,
  stampRosterOverrides,
  writeLocalSkip,
} from "./dailySkip.js";

const TODAY = "2026-08-30";
const NOW = Date.parse("2026-08-30T18:00:00.000Z");
const UNTIL_TONIGHT = "2026-08-31T06:00:00.000Z";

const quiet = (over = {}) => ({
  id: "q",
  role: "client",
  name: "Bea Quiet",
  email: "bea@example.com",
  paid: true,
  stage: "active",
  status: "active",
  unreadFromMama: 0,
  lastActiveDate: "2026-08-20",
  ...over,
});

describe("endOfLocalDay", () => {
  it("lands on local midnight tonight", () => {
    const now = new Date(2026, 7, 30, 15, 30, 0).getTime();
    const end = endOfLocalDay(now);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(7);
    expect(end.getDate()).toBe(31);
    expect(end.getHours()).toBe(0);
    expect(end.getMinutes()).toBe(0);
  });
});

describe("skipIsBroken", () => {
  it("breaks on unread or waiting approval", () => {
    expect(skipIsBroken(quiet())).toBe(false);
    expect(skipIsBroken(quiet({ unreadFromMama: 1 }))).toBe(true);
    expect(skipIsBroken(quiet({
      stage: "awaiting_approval",
      status: "pending",
      hasIntake: true,
    }))).toBe(true);
  });
});

describe("isPassedQuietToday + canPassToday", () => {
  it("hides a passed quiet mama until snoozed_until", () => {
    const passed = quiet({ snoozedUntil: UNTIL_TONIGHT });
    expect(isPassedQuietToday(passed, NOW)).toBe(true);
    expect(canPassToday(passed, TODAY, NOW)).toBe(false);
  });

  it("does not hide unread even when snoozed — a reply comes back", () => {
    const replied = quiet({ snoozedUntil: UNTIL_TONIGHT, unreadFromMama: 2 });
    expect(isPassedQuietToday(replied, NOW)).toBe(false);
    expect(canPassToday(replied, TODAY, NOW)).toBe(false);
    expect(boardReason(replied, TODAY)).toBe("unread");
  });

  it("lets Callie pass quiet, not unread or doing well", () => {
    expect(canPassToday(quiet(), TODAY, NOW)).toBe(true);
    expect(canPassToday(quiet({ unreadFromMama: 1 }), TODAY, NOW)).toBe(false);
    expect(canPassToday(quiet({ lastActiveDate: TODAY }), TODAY, NOW)).toBe(false);
  });

  it("expires after snoozed_until", () => {
    expect(isPassedQuietToday(quiet({ snoozedUntil: "2026-08-30T12:00:00.000Z" }), NOW)).toBe(false);
  });
});

describe("mergeOverrideRows", () => {
  it("keeps a just-pressed skip when the server reload is empty", () => {
    const merged = mergeOverrideRows(
      [],
      [{ email_lower: "bea@example.com", snoozed_until: UNTIL_TONIGHT }],
      NOW,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].email_lower).toBe("bea@example.com");
    expect(merged[0].snoozed_until).toBe(UNTIL_TONIGHT);
  });

  it("does not let an expired local skip overwrite the server", () => {
    const merged = mergeOverrideRows(
      [{ email_lower: "bea@example.com", snoozed_until: null, last_touch_at: "2026-08-30T12:00:00.000Z" }],
      [{ email_lower: "bea@example.com", snoozed_until: "2026-08-30T12:00:00.000Z" }],
      NOW,
    );
    expect(merged[0].snoozed_until).toBeNull();
  });

  it("prefers a local active skip over a server row that lost it", () => {
    const merged = mergeOverrideRows(
      [{ email_lower: "bea@example.com", snoozed_until: null, last_touch_at: "2026-08-30T17:00:00.000Z" }],
      [{ email_lower: "bea@example.com", snoozed_until: UNTIL_TONIGHT, last_touch_at: "2026-08-30T17:00:01.000Z" }],
      NOW,
    );
    expect(merged[0].snoozed_until).toBe(UNTIL_TONIGHT);
  });

  it("keeps her off Needs help after an empty server reload", () => {
    const merged = mergeOverrideRows(
      [],
      [{ email_lower: "bea@example.com", snoozed_until: UNTIL_TONIGHT }],
      NOW,
    );
    const [row] = stampRosterOverrides([quiet()], merged);
    expect(filterRoster([row], "needs_help", { todayIso: TODAY, nowMs: NOW })).toEqual([]);
    expect(listPassedToday([row], { nowMs: NOW }).map((c) => c.id)).toEqual(["q"]);
  });
});

describe("local skip store", () => {
  function memoryStorage() {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => { map.set(key, String(value)); },
      removeItem: (key) => { map.delete(key); },
      clear: () => { map.clear(); },
    };
  }

  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
  });

  it("round-trips an active skip and drops it after undo", () => {
    writeLocalSkip("Bea@example.com", { snoozed_until: UNTIL_TONIGHT }, NOW);
    expect(loadLocalSkips(NOW)).toEqual([
      { email_lower: "bea@example.com", snoozed_until: UNTIL_TONIGHT },
    ]);
    clearLocalSkip("bea@example.com", NOW);
    expect(loadLocalSkips(NOW)).toEqual([]);
  });

  it("prunes skips that already expired", () => {
    writeLocalSkip("bea@example.com", { snoozed_until: UNTIL_TONIGHT }, NOW);
    expect(loadLocalSkips(Date.parse("2026-08-31T07:00:00.000Z"))).toEqual([]);
  });
});

describe("stampRosterOverrides + listPassedToday", () => {
  it("copies snooze onto the matching roster row", () => {
    const [row] = stampRosterOverrides(
      [quiet()],
      [{ email_lower: "bea@example.com", snoozed_until: UNTIL_TONIGHT }],
    );
    expect(row.snoozedUntil).toBe(UNTIL_TONIGHT);
    expect(isPassedQuietToday(row, NOW)).toBe(true);
  });

  it("lists passed quiet and drops them when she replies", () => {
    const passed = quiet({ snoozedUntil: UNTIL_TONIGHT });
    const replied = quiet({
      id: "r",
      email: "replied@example.com",
      snoozedUntil: UNTIL_TONIGHT,
      unreadFromMama: 1,
    });
    expect(listPassedToday([passed, replied], { nowMs: NOW }).map((c) => c.id)).toEqual(["q"]);
  });
});
