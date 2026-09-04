import { describe, expect, it } from "vitest";

import { classifyAsk, macrosPlausible, replyIsClean } from "./coachGuardrails.js";

const scopeOf = (text) => classifyAsk(text).scope;

describe("what the coach answers", () => {
  it("answers meal questions", () => {
    const asks = [
      "what should I eat for dinner",
      "I'm going to Chipotle, what should I order",
      "I have chicken and rice in the fridge, what can I make",
      "is there anything quick with high protein",
      "what fits in what I have left",
      "I'm craving something sweet",
      "give me a lunch idea",
      "how much protein do I have left today",
    ];
    for (const ask of asks) expect(scopeOf(ask), ask).toBe("food");
  });

  it("treats a bare greeting as food, not as off topic", () => {
    expect(scopeOf("")).toBe("food");
  });
});

describe("what the coach hands to Callie", () => {
  it("never answers a symptom, even wrapped in a meal question", () => {
    const asks = [
      "I've been dizzy all afternoon, what should I eat",
      "I'm lightheaded, what should I have for lunch",
      "I've been bleeding more than usual",
      "what should I eat, I keep getting migraines",
      "I feel faint when I stand up",
    ];
    for (const ask of asks) expect(scopeOf(ask), ask).toBe("urgent");
  });

  it("never answers around medication or a diagnosis", () => {
    const asks = [
      "should I eat differently on metformin",
      "my doctor said to watch my iron",
      "what should I eat with PCOS",
      "I'm on a thyroid prescription, does that change my food",
      "should I take a supplement",
      "what should I eat while pregnant",
    ];
    for (const ask of asks) expect(scopeOf(ask), ask).toBe("urgent");
  });

  it("never answers restriction or body-shame language", () => {
    const asks = [
      "how few calories can I eat and still be ok",
      "I binged last night and feel disgusting",
      "I want to skip meals tomorrow to make up for it",
      "I've been starving myself all week",
      "I hate my body right now",
    ];
    for (const ask of asks) expect(scopeOf(ask), ask).toBe("urgent");
  });

  it("never answers mental health", () => {
    expect(scopeOf("I think I have postpartum depression")).toBe("urgent");
    expect(scopeOf("my anxiety is bad today")).toBe("urgent");
  });

  it("leaves her numbers to Callie", () => {
    const asks = [
      "can you increase my calories",
      "I think my macros are too low",
      "can I have more carbs",
      "why are my ranges set like this",
      "can you recalculate my macros",
    ];
    for (const ask of asks) expect(scopeOf(ask), ask).toBe("ranges");
  });

  it("leaves the scale to Callie", () => {
    const asks = [
      "how much weight will I lose in 8 weeks",
      "why am I not losing weight",
      "the scale went up this morning",
      "I've been at a plateau for two weeks",
    ];
    for (const ask of asks) expect(scopeOf(ask), ask).toBe("weight");
  });

  it("leaves plan and billing to Callie", () => {
    const asks = [
      "can I get a refund",
      "when does week 3 start",
      "why hasn't Callie approved my macros",
      "how do I cancel my subscription",
    ];
    for (const ask of asks) expect(scopeOf(ask), ask).toBe("admin");
  });

  it("declines anything that is not about food at all", () => {
    const asks = [
      "write me a poem about the ocean",
      "what's a good name for a puppy",
      "help me write an email to my boss",
      "who won the game last night",
    ];
    for (const ask of asks) expect(scopeOf(ask), ask).toBe("off_topic");
  });
});

describe("milk supply", () => {
  it("still answers the meal, and says the supply part is not its call", () => {
    const result = classifyAsk("what should I eat for lunch, will it affect my milk supply");
    expect(result.scope).toBe("food");
    expect(result.aside).toBe("supply");
  });

  it("hands over a pure supply question", () => {
    expect(scopeOf("is my milk supply going to drop on these ranges")).toBe("urgent");
  });

  it("does not fire on someone just mentioning that she nurses", () => {
    expect(scopeOf("quick breakfast ideas, I'm nursing so I'm always starving")).toBe("urgent");
    expect(scopeOf("quick breakfast ideas, I'm nursing and short on time")).toBe("food");
  });
});

describe("macros have to survive arithmetic", () => {
  it("accepts real food", () => {
    expect(macrosPlausible({ cal: 430, p: 45, c: 30, f: 12 })).toBe(true);
    expect(macrosPlausible({ cal: 210, p: 20, c: 25, f: 3 })).toBe(true);
    expect(macrosPlausible({ cal: 720, p: 40, c: 60, f: 32 })).toBe(true);
  });

  it("rejects numbers that do not add up", () => {
    expect(macrosPlausible({ cal: 200, p: 60, c: 60, f: 30 })).toBe(false);
    expect(macrosPlausible({ cal: 1200, p: 10, c: 10, f: 5 })).toBe(false);
  });

  it("rejects nonsense outright", () => {
    expect(macrosPlausible({ cal: 0, p: 0, c: 0, f: 0 })).toBe(false);
    expect(macrosPlausible({ cal: 400, p: -10, c: 50, f: 20 })).toBe(false);
    expect(macrosPlausible({ cal: 9000, p: 500, c: 900, f: 400 })).toBe(false);
  });
});

describe("the reply itself", () => {
  it("lets normal coaching through", () => {
    expect(replyIsClean("The chicken bowl gets your protein in and leaves room for a snack.")).toBe(true);
  });

  it("blocks the model restating her ranges or hedging like a chatbot", () => {
    expect(replyIsClean("Your ranges are 1750-1900 calories.")).toBe(false);
    expect(replyIsClean("I'm not a doctor, but you should eat more.")).toBe(false);
    expect(replyIsClean("As an AI, I can't help with that.")).toBe(false);
    expect(replyIsClean("Have a cheat meal, you earned it.")).toBe(false);
  });
});
