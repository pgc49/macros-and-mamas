import { describe, expect, it } from "vitest";

import {
  classifyAsk,
  macrosPlausible,
  replyIsClean,
  scopeIsRefused,
} from "./coachGuardrails.js";

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

  it("declines anything that is plainly not about food", () => {
    const asks = [
      "write me a poem about the ocean",
      "what's a good name for a puppy",
      "help me write an email to my boss",
      "who won the game last night",
      "what workout should I do today",
      "how do I get the baby to sleep through the night",
      "what should I watch tonight",
    ];
    for (const ask of asks) expect(scopeOf(ask), ask).toBe("off_topic");
  });

  it("refuses every scope that is Callie's, and only those", () => {
    expect(scopeIsRefused("food")).toBe(false);
    expect(scopeIsRefused("unclear")).toBe(false);
    for (const scope of ["urgent", "ranges", "weight", "admin", "off_topic"]) {
      expect(scopeIsRefused(scope), scope).toBe(true);
    }
  });
});

describe("a food question with no food word in it", () => {
  /**
   * The coach exists to answer these. Refusing a restaurant question because
   * the mama happened not to type "eat" would fail her at the moment she is
   * standing in a queue deciding, so they go to the model instead.
   */
  it("lets a restaurant or brand question through to the model", () => {
    const asks = [
      "is Chipotle ok tonight",
      "we're going to Olive Garden",
      "Panera or Sweetgreen",
      "what about a burrito bowl",
      "friend's birthday at an Italian place",
    ];
    for (const ask of asks) expect(scopeOf(ask), ask).toBe("unclear");
  });

  it("does not let an unclear ask outrank a refusal", () => {
    expect(scopeOf("is Chipotle ok, I've been dizzy")).toBe("urgent");
    expect(scopeOf("is Chipotle ok if I want to lose weight faster")).toBe("weight");
    expect(scopeOf("Panera, and can you raise my calories")).toBe("ranges");
  });

  it("still prefers food over an off-topic word when both appear", () => {
    expect(scopeOf("what should I eat after the gym")).toBe("food");
    expect(scopeOf("breakfast ideas I can make while the baby naps")).toBe("food");
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
    expect(scopeOf("quick breakfast ideas, I'm nursing so I'm always starving")).toBe("food");
    expect(scopeOf("quick breakfast ideas, I'm nursing and short on time")).toBe("food");
  });
});

/**
 * Each of these reads as a symptom to a keyword and as an ordinary sentence to
 * a person. Refusing them would hand a mama to Callie for saying she is hungry.
 */
describe("idioms that are not symptoms", () => {
  it("lets hunger be hunger", () => {
    expect(scopeOf("I'm starving, what should I eat")).toBe("food");
    expect(scopeOf("starving after that walk, lunch ideas")).toBe("food");
    expect(scopeOf("I've been starving myself all week")).toBe("urgent");
    expect(scopeOf("is starvation mode real")).toBe("urgent");
  });

  it("lets her say she is short on a macro", () => {
    expect(scopeOf("I'm not eating enough protein, what should I have")).toBe("food");
    expect(scopeOf("I'm not eating enough veg")).toBe("food");
    expect(scopeOf("I'm not eating today")).toBe("urgent");
    expect(scopeOf("I've not eating much at all lately")).toBe("urgent");
  });

  it("lets her dislike a food without it being about her body", () => {
    expect(scopeOf("greek yogurt is disgusting, what else has protein")).toBe("food");
    expect(scopeOf("I feel disgusting today")).toBe("urgent");
  });

  it("keeps the week plan out of billing", () => {
    expect(scopeOf("what's on my plan for dinner")).toBe("food");
    expect(scopeOf("I want to cancel my plan")).toBe("admin");
    expect(scopeOf("how much does my plan cost after 8 weeks")).toBe("admin");
    expect(scopeOf("when does my plan end")).toBe("admin");
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
