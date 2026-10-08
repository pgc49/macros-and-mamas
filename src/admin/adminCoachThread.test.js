import { describe, expect, it } from "vitest";
import {
  COACH_MESSAGE_POLICIES,
  buildAdminCoachView,
  coachDisplayDate,
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
  localDate: extra.localDate === undefined ? "2026-10-08" : extra.localDate,
  source: extra.source || "server",
});

describe("coachFlag", () => {
  it("pins stuck, medical, and other deflects from server-verified coach rows", () => {
    expect(coachFlag({ role: "coach", kind: "deflect", payload: { deflect: "again" }, source: "server" })).toBe("stuck");
    expect(coachFlag(
      { role: "coach", kind: "deflect", payload: { deflect: "care" }, source: "server" },
      "I've been dizzy since this morning",
    )).toBe("medical");
    expect(coachFlag({ role: "coach", kind: "deflect", payload: { deflect: "emergency" }, source: "server" })).toBe("medical");
    expect(coachFlag({ role: "coach", kind: "deflect", payload: { deflect: "medical" }, source: "server" })).toBe("medical");
    expect(coachFlag({ role: "coach", kind: "deflect", payload: { deflect: "ranges" }, source: "server" })).toBe("deflect");
    expect(coachFlag({ role: "coach", kind: "text", payload: null, source: "server" })).toBeNull();
  });

  it("does not pin mama rows or client-recorded payloads", () => {
    expect(coachFlag({
      role: "mama",
      kind: "deflect",
      payload: { deflect: "again" },
      source: "server",
    })).toBeNull();
    expect(coachFlag({
      role: "coach",
      kind: "deflect",
      payload: { deflect: "again" },
      source: "client",
    })).toBeNull();
    expect(coachFlag({
      role: "coach",
      kind: "deflect",
      payload: { deflect: "care" },
      source: "client",
    }, "I've been dizzy since this morning")).toBeNull();
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

  it("coerces card fields to strings so a bad payload cannot crash", () => {
    const plates = plainCoachPlates({
      cards: [{
        name: { forged: true },
        title: "Safe plate",
        cal: "430",
        p: { n: 1 },
        reason: { why: "nope" },
      }],
    });
    expect(plates[0].name).toBe("Safe plate");
    expect(plates[0].macros).toBe("430 cal · P0 · C0 · F0");
    expect(plates[0].reason).toBe("");
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

  it("keeps a null-date row in seq order and dates it from created_at", () => {
    const messages = [
      mama("m1", "what should I eat", { seq: 1, localDate: "2026-10-08" }),
      coach("c-null", {
        seq: 2,
        localDate: null,
        createdAt: "2026-10-02T01:05:00.000Z",
        body: "Saved without a day.",
      }),
      mama("m2", "thanks", { seq: 3, localDate: "2026-10-08" }),
    ];
    const view = buildAdminCoachView(messages);
    expect(view.thread.map((m) => m.id)).toEqual(["m2", "c-null", "m1"]);
    expect(coachDisplayDate(messages[1])).toBe("2026-10-01");
  });
});

describe("COACH_MESSAGE_POLICIES", () => {
  it("names the live RLS policies", () => {
    expect(COACH_MESSAGE_POLICIES).toEqual({
      select: "coach_messages_select_own_visible_or_admin",
      insert: "coach_messages_insert_own_mama",
      hide: "hide_coach_messages",
      clear: "clear_coach_messages",
    });
  });
});
