import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appendCoachRefusal,
  coachRefusalLine,
  coachSummaryDateIso,
  countRefusalDoorLines,
  escalateDoor,
  isLoggingRefusal,
  isWontLogRefusal,
  saidSheSkipped,
  MAX_MEDICAL_ESCALATES_PER_DAY,
  MAX_SUMMARY_ESCALATES,
  mergeRefusalSummary,
  preserveRefusalLines,
  refusalDoor,
} from "./coachRefusalSummary.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a refusal line is factual", () => {
  it("names only a stuck or medical escalate", () => {
    expect(refusalDoor("urgent")).toBe("medical");
    expect(refusalDoor("stuck")).toBe("stuck");
    expect(refusalDoor("supply")).toBeNull();
    expect(refusalDoor("food")).toBeNull();
    expect(escalateDoor("I've been dizzy since this morning", { scope: "urgent" })).toBe("medical");
    expect(escalateDoor("should I skip dinner", { escalate: "stuck" })).toBe("stuck");
    expect(escalateDoor("will this affect my supply", { scope: "supply" })).toBeNull();
    expect(escalateDoor("I feel awful about what I ate", { scope: "urgent" })).toBeNull();
    expect(escalateDoor("what workout should I do", { scope: "off_topic" })).toBeNull();
    expect(escalateDoor("what should I eat", { escalate: "stuck" })).toBeNull();
    expect(coachRefusalLine("I've been dizzy since this morning", "medical")).toBe(
      "Coach refused (medical): I've been dizzy since this morning",
    );
    expect(coachRefusalLine("should I skip dinner", "stuck")).toBe(
      "Coach refused (stuck): should I skip dinner",
    );
  });

  it("appends onto Callie's summary and does not replace it", () => {
    const line = coachRefusalLine("I've been dizzy since this morning", "medical");
    const merged = mergeRefusalSummary("Quiet week. Protein is steady.", line);
    expect(merged.ok).toBe(true);
    expect(merged.summary.startsWith("Quiet week. Protein is steady.")).toBe(true);
    expect(merged.summary).toContain(line);
    expect(mergeRefusalSummary(merged.summary, line)).toEqual({
      ok: true,
      summary: merged.summary,
      unchanged: true,
    });
  });

  it("keeps the refusal line when a new summary is generated", () => {
    const existing = "Quiet week.\nCoach refused (supply): my supply dipped";
    const fresh = preserveRefusalLines(existing, "New snapshot from her logs.");
    expect(fresh.ok).toBe(true);
    expect(fresh.summary.startsWith("New snapshot from her logs.")).toBe(true);
    expect(fresh.summary).toContain("Coach refused (supply): my supply dipped");
  });

  it("dedupes whole lines so a substring does not swallow a later ask", () => {
    const first = mergeRefusalSummary("", "Coach refused (crisis): I want to die tonight, I have a plan");
    const both = mergeRefusalSummary(first.summary, "Coach refused (crisis): I want to die");
    expect(both.ok).toBe(true);
    expect(both.summary.split("\n")).toEqual([
      "Coach refused (crisis): I want to die tonight, I have a plan",
      "Coach refused (crisis): I want to die",
    ]);
    const msg1 = mergeRefusalSummary("", "Coach refused (medical): message 1");
    const msg10 = mergeRefusalSummary(msg1.summary, "Coach refused (medical): message 10");
    expect(msg10.summary.split("\n")).toEqual([
      "Coach refused (medical): message 1",
      "Coach refused (medical): message 10",
    ]);
  });

  it("never cuts a Coach refused line and fails closed when crisis cannot fit", () => {
    const crisis = "Coach refused (crisis): I want to die";
    const padded = `${"p".repeat(3969)}\n${crisis}`;
    const kept = mergeRefusalSummary("p".repeat(3969), crisis);
    expect(kept.ok).toBe(true);
    expect(kept.summary).toContain(crisis);
    expect(kept.summary).not.toMatch(new RegExp(`${crisis.slice(0, -1)}$`));
    expect(kept.summary.split("\n").includes(crisis)).toBe(true);
    expect(padded.includes(crisis)).toBe(true);

    const wall = Array.from({ length: 14 }, (_, i) => (
      `Coach refused (crisis): ${String(i).padStart(276, "x")}`
    ));
    const overflow = mergeRefusalSummary(wall.join("\n"), "Coach refused (crisis): newest-must-not-cut");
    expect(overflow).toEqual({ ok: false, reason: "full", summary: wall.join("\n") });

    const refresh = preserveRefusalLines(wall.join("\n"), "Fresh snapshot from her logs.");
    expect(refresh).toEqual({ ok: false, reason: "full" });
  });

  it("uses the Pacific calendar day when UTC has already rolled over", () => {
    const eveningPt = new Date("2026-10-02T01:05:00.000Z");
    expect(eveningPt.toISOString().slice(0, 10)).toBe("2026-10-02");
    expect(coachSummaryDateIso(eveningPt)).toBe("2026-10-01");
  });

  it("merges a medical line onto the Pacific day's seed and skips a supply refuse", async () => {
    const eveningPt = new Date("2026-10-02T01:05:00.000Z");
    const posts = [];
    const reads = [];
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const value = String(url);
      if (value.includes("client_summaries") && init?.method === "POST") {
        posts.push(JSON.parse(init.body));
        return new Response(null, { status: 201 });
      }
      if (value.includes("client_summaries")) {
        reads.push(value);
        return new Response(JSON.stringify([{
          summary: "QA prior summary — keep this paragraph.",
          suggested_touch: "Check in.",
          model: "admin-model",
        }]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });

    const medical = await appendCoachRefusal(env, "profile-1", {
      asked: "I've been dizzy since this morning",
      scope: "urgent",
      now: eveningPt,
    });
    expect(medical.ok).toBe(true);
    expect(reads[0]).toContain("for_date=eq.2026-10-01");
    expect(reads[0]).not.toContain("for_date=eq.2026-10-02");
    expect(posts).toHaveLength(1);
    expect(posts[0].for_date).toBe("2026-10-01");
    expect(posts[0].summary.startsWith("QA prior summary — keep this paragraph.")).toBe(true);
    expect(posts[0].summary).toContain("Coach refused (medical): I've been dizzy since this morning");
    expect(posts[0].suggested_touch).toBe("Check in.");

    const supply = await appendCoachRefusal(env, "profile-1", {
      asked: "will this affect my milk supply",
      scope: "supply",
      now: eveningPt,
    });
    expect(supply).toEqual({ ok: false, skipped: true });
    expect(posts).toHaveLength(1);
  });

  it("allows three distinct medical lines per Pacific day so a false-ish line cannot block a real one", async () => {
    expect(MAX_MEDICAL_ESCALATES_PER_DAY).toBe(3);
    const existing = [
      "Coach refused (medical): I've been dizzy since this morning",
      "Coach refused (medical): I have a fever",
      "Coach refused (medical): I have a migraine",
    ].join("\n");
    expect(countRefusalDoorLines(existing, "medical")).toBe(3);
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    };
    const posts = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("client_summaries") && init?.method === "POST") {
        posts.push(JSON.parse(init.body));
        return new Response(null, { status: 201 });
      }
      if (String(url).includes("client_summaries")) {
        return new Response(JSON.stringify([{ summary: existing }]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    const result = await appendCoachRefusal(env, "profile-1", {
      asked: "I have a rash",
      scope: "urgent",
    });
    expect(result).toEqual({ ok: true, capped: true });
    expect(posts).toHaveLength(0);
  });

  it("keeps a same-day medical line and a later distinct crisis line", async () => {
    const tenAmPt = new Date("2026-10-08T17:00:00.000Z");
    const eightPmPt = new Date("2026-10-09T03:00:00.000Z");
    expect(coachSummaryDateIso(tenAmPt)).toBe("2026-10-08");
    expect(coachSummaryDateIso(eightPmPt)).toBe("2026-10-08");
    let summary = "";
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("append_coach_refusal_line")) {
        const body = JSON.parse(init.body);
        if (summary.split("\n").some((row) => row === body.p_line)) {
          return new Response(JSON.stringify({ ok: true, unchanged: true }), { status: 200 });
        }
        const n = countRefusalDoorLines(summary, body.p_door);
        if (n >= body.p_max) {
          return new Response(JSON.stringify({ ok: true, capped: true }), { status: 200 });
        }
        const merged = mergeRefusalSummary(summary, body.p_line);
        if (!merged.ok) {
          return new Response(JSON.stringify({ ok: false, reason: merged.reason }), { status: 200 });
        }
        summary = merged.summary;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    const migraine = await appendCoachRefusal(env, "profile-1", {
      asked: "I have a migraine",
      scope: "urgent",
      now: tenAmPt,
    });
    const crisis = await appendCoachRefusal(env, "profile-1", {
      asked: "I want to die",
      scope: "urgent",
      now: eightPmPt,
    });
    expect(migraine).toEqual({ ok: true });
    expect(crisis).toEqual({ ok: true });
    expect(summary).toContain("Coach refused (medical): I have a migraine");
    expect(summary).toContain("Coach refused (crisis): I want to die");
  });

  it("still caps stuck repeats so one mama cannot flood the card", async () => {
    const flooded = Array.from({ length: MAX_SUMMARY_ESCALATES }, (_, i) => (
      `Coach refused (stuck): ask ${i}`
    )).join("\n");
    expect(countRefusalDoorLines(flooded, "stuck")).toBe(MAX_SUMMARY_ESCALATES);
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    };
    const posts = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("client_summaries") && init?.method === "POST") {
        posts.push(JSON.parse(init.body));
        return new Response(null, { status: 201 });
      }
      if (String(url).includes("client_summaries")) {
        return new Response(JSON.stringify([{ summary: flooded }]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    const result = await appendCoachRefusal(env, "profile-1", {
      asked: "should I skip dinner",
      escalate: "stuck",
    });
    expect(result).toEqual({ ok: true, capped: true });
    expect(posts).toHaveLength(0);
  });

  it("does not treat a logging refusal as a card for Callie", () => {
    expect(isWontLogRefusal("I won't log this")).toBe(true);
    expect(isWontLogRefusal("I will not log dinner")).toBe(true);
    expect(isWontLogRefusal("I hate tracking")).toBe(true);
    expect(isWontLogRefusal("should I skip dinner")).toBe(false);
    expect(isLoggingRefusal("I won't log this")).toBe(true);
    expect(isLoggingRefusal("should I skip dinner")).toBe(false);
    expect(saidSheSkipped("should I skip dinner")).toBe(true);
    expect(saidSheSkipped("I won't log this")).toBe(false);
    expect(isWontLogRefusal("will this affect my milk supply")).toBe(false);
    expect(isWontLogRefusal("I've been dizzy since this morning")).toBe(false);
  });

  it("treats a full refusal card as a failed write", async () => {
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    };
    const posts = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("append_coach_refusal_line")) {
        return new Response(JSON.stringify({ ok: false, reason: "full" }), { status: 200 });
      }
      if (String(url).includes("client_summaries") && init?.method === "POST") {
        posts.push(JSON.parse(init.body));
        return new Response(null, { status: 201 });
      }
      return new Response("[]", { status: 200 });
    });
    const result = await appendCoachRefusal(env, "profile-1", {
      asked: "I want to die",
      scope: "urgent",
    });
    expect(result).toEqual({ ok: false, reason: "full" });
    expect(posts).toHaveLength(0);
  });
});
