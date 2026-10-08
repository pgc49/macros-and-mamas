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

/** Crisis / 911 line. */
export const CRISIS_ASKS = [
  "I want to die",
  "I've had thoughts of hurting myself",
  "thoughts of hurting myself",
  "thinking about hurting myself",
  "want to hurt myself",
  "cut myself",
  "I don't want to be here",
  "I don't want to be here anymore",
  "I'm scared I might hurt the baby",
  "I might hurt the baby",
  "hurt my baby",
  "my chest hurts when I breathe",
  "I have chest pain",
  "chest pain with trouble breathing",
  "I can't breathe",
  "I fainted after lunch",
  "I fainted",
  "I'm passing out",
  "I passed out",
  "soaking through pads",
  "soaking pads",
  "passing large clots",
  "bad headache and my vision is blurry",
  "headache with blurry vision",
  "one of my legs is swollen and painful",
  "one swollen calf",
  "I had a seizure",
  "I'm hearing things that aren't there",
  "I'm seeing things that aren't there",
  "end my life",
  "end it all",
  "my heart is racing and I have chest pain",
  "my heart is racing and I can't catch my breath",
];

/** Ordinary medical — Callie's card, not 911. */
export const MEDICAL_ASKS = [
  "I've been bleeding heavily",
  "I have a fever",
  "I'm skipping dinner because I feel dizzy",
  "only eating 800 calories",
  "I have high blood pressure",
  "my blood pressure was high",
  "I've been vomiting all morning",
  "I've been throwing up",
  "I threw up after lunch",
  "I feel nauseous",
  "I think I have mastitis",
  "my breast is red, hot, and hard and I have a fever",
  "my incision is red and hot",
  "I haven't eaten all day",
  "I haven't eaten anything all day",
  "my heart is racing",
  "I hurt myself at the gym",
  "I haven't slept for days",
  "I haven't slept in days",
  "I haven't slept well in days",
  "I feel faint",
  "I feel faint when I stand up",
];

/** At least the 21 reviewer phrasings. Each must append exactly once. */
export const RED_FLAG_ASKS = [...CRISIS_ASKS, ...MEDICAL_ASKS];

const RED_FLAG_NEGATIVES = [
  "I'm dying for tacos",
  "I want to die for these tacos",
  "dying for these tacos",
  "these tacos are to die for",
  "can I end it with something sweet",
  "I don't want to be here at this restaurant",
  "this workout is killing me",
  "my heart races when I see dessert",
];

describe("crisis and postpartum red flags", () => {
  it("classifies every reviewer phrasing as urgent", () => {
    expect(RED_FLAG_ASKS.length).toBeGreaterThanOrEqual(21);
    for (const ask of CRISIS_ASKS) {
      expect(classifyAsk(ask).scope, ask).toBe("urgent");
      expect(isCrisisUrgent(ask), ask).toBe(true);
      expect(isClinicalUrgent(ask), ask).toBe(true);
      expect(escalateDoor(ask, { scope: "urgent" }), ask).toBe("crisis");
    }
    for (const ask of MEDICAL_ASKS) {
      const scope = classifyAsk(ask).scope;
      if (ask === "only eating 800 calories") {
        expect(scope, ask).toBe("disordered");
        continue;
      }
      expect(scope, ask).toBe("urgent");
      expect(isClinicalUrgent(ask), ask).toBe(true);
      expect(isCrisisUrgent(ask), ask).toBe(false);
      expect(escalateDoor(ask, { scope: "urgent" }), ask).toBe("medical");
    }
  });

  it("sends crying-all-day to the mood door, not medical", () => {
    expect(classifyAsk("I've been crying all day").scope).toBe("mood");
    expect(isCrisisUrgent("I've been crying all day")).toBe(false);
    expect(escalateDoor("I've been crying all day", { scope: "mood" })).toBe("mood");
  });

  it("does not treat food idioms as a crisis", () => {
    expect(classifyAsk("I'm dying for tacos").scope).not.toBe("urgent");
    expect(isClinicalUrgent("I'm dying for tacos")).toBe(false);
    expect(isCrisisUrgent("I'm dying for tacos")).toBe(false);
    expect(escalateDoor("I'm dying for tacos")).toBeNull();
    expect(isCrisisUrgent("I want to die for these tacos")).toBe(false);
    expect(isClinicalUrgent("I want to die for these tacos")).toBe(false);
    expect(escalateDoor("I want to die for these tacos")).toBeNull();
    expect(isCrisisUrgent("these tacos are to die for")).toBe(false);
    expect(isCrisisUrgent("can I end it with something sweet")).toBe(false);
    expect(escalateDoor("can I end it with something sweet")).toBeNull();
    expect(isCrisisUrgent("I don't want to be here at this restaurant")).toBe(false);
    expect(classifyAsk("I don't want to be here at this restaurant").scope).not.toBe("urgent");
    expect(classifyAsk("this workout is killing me").scope).toBe("off_topic");
    expect(isClinicalUrgent("this workout is killing me")).toBe(false);
    expect(escalateDoor("this workout is killing me", { scope: "off_topic" })).toBeNull();
    expect(classifyAsk("my heart races when I see dessert").scope).not.toBe("urgent");
    expect(isClinicalUrgent("my heart races when I see dessert")).toBe(false);
    expect(isCrisisUrgent("my heart races when I see dessert")).toBe(false);
  });

  it("uses the emergency line for crisis and the medical line for ordinary symptoms", () => {
    expect(INCLUDE_COACH_EMERGENCY_LINE).toBe(true);
    expect(COACH_DEFLECT.emergency.line).toBe(COACH_EMERGENCY_LINE);
    expect(COACH_EMERGENCY_LINE).toBe(
      "Please get help right now. If this feels like an emergency, call 911. If you're having thoughts of hurting yourself or your baby, call or text 988. Then call your doctor. Callie will see this, but maybe not right away, so please don't wait for her.",
    );
    expect(COACH_DEFLECT.emergency.cta).toBe("Message Callie too");
    expect(deflectForScope("urgent", "I want to die")).toBe("emergency");
    expect(deflectForScope("urgent", "thinking about hurting myself")).toBe("emergency");
    expect(deflectForScope("urgent", "hurt my baby")).toBe("emergency");
    expect(deflectForScope("urgent", "chest pain with trouble breathing")).toBe("emergency");
    expect(deflectForScope("urgent", "soaking pads")).toBe("emergency");
    expect(deflectForScope("urgent", "headache with blurry vision")).toBe("emergency");
    expect(deflectForScope("urgent", "one swollen calf")).toBe("emergency");
    expect(deflectForScope("urgent", "I fainted after lunch")).toBe("emergency");
    expect(deflectForScope("urgent", "I might hurt the baby")).toBe("emergency");
    expect(deflectForScope("urgent", "I hurt myself at the gym")).toBe("medical");
    expect(deflectForScope("urgent", "I haven't slept well in days")).toBe("medical");
    expect(deflectForScope("urgent", "I feel faint")).toBe("medical");
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
      const door = CRISIS_ASKS.includes(ask) ? "crisis" : "medical";
      const prefix = `Coach refused (${door}):`;
      const lines = String(posts.at(-1)?.summary || "").split("\n").filter((line) => line.startsWith(prefix));
      expect(lines, ask).toHaveLength(1);
      expect(lines[0], ask).toContain(ask);

      const repeat = await appendCoachRefusal(env, "profile-1", { asked: ask, scope: "urgent" });
      expect(repeat.ok, `${ask} repeat`).toBe(true);
      expect(repeat.unchanged || repeat.capped, `${ask} once`).toBeTruthy();
      const after = String(posts.at(-1)?.summary || "").split("\n").filter((line) => line.startsWith(prefix));
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
