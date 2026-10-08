import { describe, expect, it, vi } from "vitest";

import {
  classifyAsk,
  deflectForScope,
  deflectModelHandoff,
  isClinicalUrgent,
  isCrisisUrgent,
} from "./coachGuardrails.js";
import { appendCoachRefusal, escalateDoor } from "./coachRefusalSummary.js";
import { COACH_DEFLECT, COACH_EMERGENCY_LINE, INCLUDE_COACH_EMERGENCY_LINE } from "../../src/content/coachVoice.js";

/** At least the 21 reviewer phrasings. Each must append exactly once. */
export const RED_FLAG_ASKS = [
  "I want to die",
  "I've had thoughts of hurting myself",
  "thoughts of hurting myself",
  "I don't want to be here",
  "I'm scared I might hurt the baby",
  "I might hurt the baby",
  "my chest hurts when I breathe",
  "I have chest pain",
  "I can't breathe",
  "I fainted after lunch",
  "I'm passing out",
  "soaking through pads",
  "passing large clots",
  "I've been bleeding heavily",
  "I have a fever",
  "bad headache and my vision is blurry",
  "one of my legs is swollen and painful",
  "I had a seizure",
  "I'm hearing things that aren't there",
  "I'm seeing things that aren't there",
  "I haven't slept for days",
  "I'm skipping dinner because I feel dizzy",
  "only eating 800 calories",
];

const RED_FLAG_NEGATIVES = [
  "I'm dying for tacos",
  "this workout is killing me",
];

describe("crisis and postpartum red flags", () => {
  it("classifies every reviewer phrasing as urgent", () => {
    expect(RED_FLAG_ASKS.length).toBeGreaterThanOrEqual(21);
    for (const ask of RED_FLAG_ASKS) {
      expect(classifyAsk(ask).scope, ask).toBe("urgent");
      expect(isClinicalUrgent(ask), ask).toBe(true);
      expect(escalateDoor(ask, { scope: "urgent" }), ask).toBe("medical");
    }
  });

  it("does not treat food idioms as a crisis", () => {
    expect(classifyAsk("I'm dying for tacos").scope).not.toBe("urgent");
    expect(isClinicalUrgent("I'm dying for tacos")).toBe(false);
    expect(isCrisisUrgent("I'm dying for tacos")).toBe(false);
    expect(escalateDoor("I'm dying for tacos")).toBeNull();
    expect(classifyAsk("this workout is killing me").scope).toBe("off_topic");
    expect(isClinicalUrgent("this workout is killing me")).toBe(false);
    expect(escalateDoor("this workout is killing me", { scope: "off_topic" })).toBeNull();
  });

  it("uses the emergency line for crisis and the medical line for ordinary symptoms", () => {
    expect(INCLUDE_COACH_EMERGENCY_LINE).toBe(true);
    expect(COACH_DEFLECT.emergency.line).toBe(COACH_EMERGENCY_LINE);
    expect(COACH_DEFLECT.emergency.cta).toBe("Message Callie");
    expect(deflectForScope("urgent", "I want to die")).toBe("emergency");
    expect(deflectForScope("urgent", "I fainted after lunch")).toBe("emergency");
    expect(deflectForScope("urgent", "I might hurt the baby")).toBe("emergency");
    expect(deflectForScope("urgent", "I've been dizzy since this morning")).toBe("medical");
    expect(deflectForScope("urgent", "I'm skipping dinner because I feel dizzy")).toBe("medical");
    expect(deflectForScope("urgent", "only eating 800 calories")).toBe("medical");
    expect(deflectForScope("urgent", "I feel awful about what I ate")).toBe("care");
    expect(COACH_DEFLECT.medical.line).toMatch(/Callie, not me/);
    expect(COACH_DEFLECT.medical.line).not.toMatch(/911|988/);
  });

  it("checks symptoms before the not-logging rule", () => {
    expect(escalateDoor("I'm skipping dinner because I feel dizzy")).toBe("medical");
    expect(escalateDoor("I'm not logging dinner because I feel dizzy")).toBe("medical");
    expect(escalateDoor("I won't log this")).toBeNull();
  });

  it("re-checks a model handoff instead of answering with the off-topic line", () => {
    expect(deflectModelHandoff("Chipotle, I want to die")).toBe("emergency");
    expect(deflectModelHandoff("I fainted after lunch")).toBe("emergency");
    expect(deflectModelHandoff("I've been dizzy since this morning")).toBe("medical");
    expect(deflectModelHandoff("what should I eat before my run")).toBe("offTopic");
    expect(deflectModelHandoff("I'm dying for tacos")).toBe("offTopic");
  });

  it("appends each red flag once and appends nothing for the negatives", async () => {
    const posts = [];
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    };
    let summary = "QA prior summary.";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("client_summaries") && init?.method === "POST") {
        const body = JSON.parse(init.body);
        posts.push(body);
        summary = body.summary;
        return new Response(null, { status: 201 });
      }
      if (String(url).includes("client_summaries")) {
        return new Response(JSON.stringify([{ summary }]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });

    for (const ask of RED_FLAG_ASKS) {
      posts.length = 0;
      summary = "QA prior summary.";
      const first = await appendCoachRefusal(env, "profile-1", { asked: ask, scope: "urgent" });
      expect(first.ok, ask).toBe(true);
      expect(first.unchanged || first.capped, `${ask} first write`).toBeFalsy();
      const lines = String(posts.at(-1)?.summary || "").split("\n").filter((line) => line.startsWith("Coach refused (medical):"));
      expect(lines, ask).toHaveLength(1);
      expect(lines[0], ask).toContain(ask);

      const repeat = await appendCoachRefusal(env, "profile-1", { asked: ask, scope: "urgent" });
      expect(repeat.ok, `${ask} repeat`).toBe(true);
      expect(repeat.unchanged || repeat.capped, `${ask} once`).toBeTruthy();
      const after = String(posts.at(-1)?.summary || "").split("\n").filter((line) => line.startsWith("Coach refused (medical):"));
      expect(after, `${ask} still once`).toHaveLength(1);
    }

    const before = posts.length;
    for (const ask of RED_FLAG_NEGATIVES) {
      const result = await appendCoachRefusal(env, "profile-1", { asked: ask });
      expect(result).toEqual({ ok: false, skipped: true });
    }
    expect(posts).toHaveLength(before);
    vi.restoreAllMocks();
  });
});
