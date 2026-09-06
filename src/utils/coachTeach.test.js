import { describe, expect, it } from "vitest";

import { COACH_COPY, COACH_PASS, underDayCopy } from "../content/coachVoice.js";
import { countTeachInThread, localCoachTeach, teachBody } from "./coachTeach.js";

describe("Callie's own answers, before a model is called", () => {
  it("gives the PS method when she is out with no numbers", () => {
    for (const text of [
      "I'm eating out, what should I do",
      "I'm at a restaurant with no nutrition info",
      "what should I order",
    ]) {
      expect(localCoachTeach(text)).toMatchObject({ topic: "psMethod" });
    }
    expect(teachBody("psMethod")).toBe(COACH_COPY.teachPs);
    expect(teachBody("psMethod")).toMatch(/PS method/i);
  });

  it("never tells her to skip a meal", () => {
    expect(localCoachTeach("should I skip dinner")).toMatchObject({ topic: "neverSkip" });
    expect(localCoachTeach("I'm 400 over, skip dinner?")).toMatchObject({ topic: "neverSkip" });
    expect(teachBody("neverSkip")).toMatch(/never skip a meal/i);
  });

  it("answers is-this-ok as real food, not a verdict", () => {
    expect(localCoachTeach("is pizza ok")).toMatchObject({ topic: "realFood" });
    expect(localCoachTeach("can I have a protein bar")).toMatchObject({ topic: "realFood" });
    expect(teachBody("realFood")).toMatch(/real food/i);
    expect(teachBody("realFood")).toMatch(/Oreo/);
  });

  it("answers coffee, alcohol, fasting and sweeteners in her words", () => {
    expect(localCoachTeach("is coffee ok in the morning")).toMatchObject({ topic: "coffee" });
    expect(localCoachTeach("can I have a glass of wine")).toMatchObject({ topic: "alcohol" });
    expect(localCoachTeach("should I try intermittent fasting")).toMatchObject({ topic: "fasting" });
    expect(localCoachTeach("is Diet Coke ok")).toMatchObject({ topic: "sweetener" });
    expect(teachBody("coffee")).toMatch(/empty stomach/);
    expect(teachBody("alcohol")).toMatch(/up to you/);
    expect(teachBody("fasting")).toMatch(/cortisol/);
    expect(teachBody("sweetener")).toMatch(/Olipop/);
  });

  it("asks about the 50g fat floor when the day is under", () => {
    expect(localCoachTeach("I hit my protein but have calories left")).toMatchObject({ topic: "underDay" });
    expect(underDayCopy({ fatEaten: 32, carbsShort: true })).toMatch(/50g of fat/);
    expect(underDayCopy({ fatEaten: 32, carbsShort: true })).toMatch(/carbs/);
    expect(underDayCopy({ fatEaten: 60, carbsShort: false })).not.toMatch(/You're under 50g/);
  });

  it("does not swallow a meal ask", () => {
    expect(localCoachTeach("what should I eat")).toBeNull();
    expect(localCoachTeach("how's my day looking")).toBeNull();
  });
});

describe("a pain point asked a third time", () => {
  it("counts the coach's own replies on that topic", () => {
    const thread = [
      { role: "coach", teach: "neverSkip" },
      { role: "coach", teach: "neverSkip" },
      { role: "coach", teach: "psMethod" },
    ];
    expect(countTeachInThread(thread, "neverSkip")).toBe(2);
    expect(countTeachInThread(thread, "psMethod")).toBe(1);
  });
});

describe("the handoff closer", () => {
  it("asks her to message Callie instead of sounding like the bot already did", () => {
    expect(COACH_PASS).toBe(
      "That's something Callie might be better able to answer than me. Message her and she'll get back to you.",
    );
    expect(COACH_PASS).not.toMatch(/I'll pass/i);
  });
});
