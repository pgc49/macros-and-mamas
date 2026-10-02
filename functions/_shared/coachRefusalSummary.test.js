import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appendCoachRefusal,
  coachRefusalLine,
  coachSummaryDateIso,
  escalateDoor,
  isLoggingRefusal,
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
    expect(merged.startsWith("Quiet week. Protein is steady.")).toBe(true);
    expect(merged).toContain(line);
    expect(mergeRefusalSummary(merged, line)).toBe(merged);
  });

  it("keeps the refusal line when a new summary is generated", () => {
    const existing = "Quiet week.\nCoach refused (supply): my supply dipped";
    const fresh = preserveRefusalLines(existing, "New snapshot from her logs.");
    expect(fresh.startsWith("New snapshot from her logs.")).toBe(true);
    expect(fresh).toContain("Coach refused (supply): my supply dipped");
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

  it("does not treat a logging refusal as a card for Callie", () => {
    expect(isLoggingRefusal("I won't log this")).toBe(true);
    expect(isLoggingRefusal("I will not log dinner")).toBe(true);
    expect(isLoggingRefusal("should I skip dinner")).toBe(true);
    expect(isLoggingRefusal("will this affect my milk supply")).toBe(false);
    expect(isLoggingRefusal("I've been dizzy since this morning")).toBe(false);
  });
});
