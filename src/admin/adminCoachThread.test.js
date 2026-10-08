import { describe, expect, it } from "vitest";
import {
  COACH_MESSAGE_POLICIES,
  buildAdminCoachView,
  coachFlag,
  flagLabel,
  plainCoachPlates,
} from "./adminCoachThread.js";

const mama = (id, body, extra = {}) => ({
  id,
  role: "mama",
  body,
  kind: "text",
  payload: null,
  seq: extra.seq ?? 1,
  createdAt: extra.createdAt || "2026-10-08T16:00:00.000Z",
  hiddenAt: extra.hiddenAt || null,
  localDate: extra.localDate || "2026-10-08",
});

const coach = (id, extra = {}) => ({
  id,
  role: "coach",
  body: extra.body || "",
  kind: extra.kind || "text",
  payload: extra.payload || null,
  seq: extra.seq ?? 2,
  createdAt: extra.createdAt || "2026-10-08T16:00:01.000Z",
  hiddenAt: extra.hiddenAt || null,
  localDate: extra.localDate || "2026-10-08",
});

describe("coachFlag", () => {
  it("pins stuck, medical, and other deflects", () => {
    expect(coachFlag({ kind: "deflect", payload: { deflect: "again" } })).toBe("stuck");
    expect(coachFlag(
      { kind: "deflect", payload: { deflect: "care" } },
      "I've been dizzy since this morning",
    )).toBe("medical");
    expect(coachFlag({ kind: "deflect", payload: { deflect: "ranges" } })).toBe("deflect");
    expect(coachFlag({ kind: "text", payload: null })).toBeNull();
  });
});

describe("plainCoachPlates", () => {
  it("renders plate and why in plain form", () => {
    const plates = plainCoachPlates({
      cards: [{
        name: "Chicken bowl",
        cal: 430.2,
        p: 45,
        c: 30,
        f: 12,
        reason: "Gets protein into range.",
      }],
    });
    expect(plates).toEqual([{
      name: "Chicken bowl",
      macros: "430 cal · P45 · C30 · F12",
      reason: "Gets protein into range.",
    }]);
  });
});

describe("buildAdminCoachView", () => {
  it("orders newest first and pins flags above the thread", () => {
    const messages = [
      mama("m1", "what should I eat", { seq: 1 }),
      coach("c1", {
        seq: 2,
        kind: "cards",
        body: "Tonight.",
        payload: { cards: [{ name: "Chicken bowl", cal: 430, p: 45, c: 30, f: 12, reason: "Fits." }] },
      }),
      mama("m2", "I've been dizzy since this morning", { seq: 3 }),
      coach("c2", { seq: 4, kind: "deflect", payload: { deflect: "care" } }),
      mama("m3", "should I skip dinner", { seq: 5 }),
      coach("c3", { seq: 6, kind: "deflect", payload: { deflect: "again" } }),
    ];
    const view = buildAdminCoachView(messages);
    expect(view.thread.map((m) => m.id)).toEqual(["c3", "m3", "c2", "m2", "c1", "m1"]);
    expect(view.pinned.map((m) => [m.id, m.flag])).toEqual([
      ["c3", "stuck"],
      ["c2", "medical"],
    ]);
    expect(flagLabel("stuck")).toBe("Stuck");
  });
});

describe("COACH_MESSAGE_POLICIES", () => {
  it("names the live RLS policies", () => {
    expect(COACH_MESSAGE_POLICIES).toEqual({
      select: "coach_messages_select_own_visible_or_admin",
      insert: "coach_messages_insert_own_mama",
      update: "coach_messages_hide_own",
    });
  });
});
