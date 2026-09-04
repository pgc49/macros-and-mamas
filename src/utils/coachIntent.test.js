import { describe, expect, it } from "vitest";

import { localCoachIntent } from "./coachIntent.js";

describe("asks the coach answers without a model", () => {
  it("routes the question she asks most", () => {
    for (const text of [
      "what should I eat?",
      "What can I have",
      "what should i make",
      "I'm hungry",
      "help me decide",
      "I don't know what to eat",
      "feed me",
    ]) {
      expect(localCoachIntent(text)).toMatchObject({ kind: "cards" });
    }
  });

  it("carries the slot she named", () => {
    expect(localCoachIntent("what should I eat for dinner?")).toMatchObject({
      kind: "cards",
      slot: "dinner",
    });
    expect(localCoachIntent("what's for lunch")).toMatchObject({ kind: "cards", slot: "lunch" });
    expect(localCoachIntent("breakfast?")).toMatchObject({ kind: "cards", slot: "breakfast" });
    expect(localCoachIntent("ideas for a snack")).toMatchObject({ kind: "cards", slot: "snack" });
  });

  /**
   * "Snack on" is one phrase. Leaving the "on" behind left a message nothing
   * matched, so the one question the snack bank answers best was spent on a
   * model call.
   */
  it("answers a snack asked for the way she'd say it", () => {
    for (const text of [
      "what should I snack on",
      "what can I snack on?",
      "snack",
      "I want a snack",
      "what about a snack",
      "snack ideas",
    ]) {
      expect(localCoachIntent(text)).toMatchObject({ kind: "cards", slot: "snack" });
    }
  });

  it("takes the same shapes for the other three meals", () => {
    expect(localCoachIntent("what should I have for dinner")).toMatchObject({ slot: "dinner" });
    expect(localCoachIntent("what should I do for lunch")).toMatchObject({ slot: "lunch" });
    expect(localCoachIntent("what about breakfast")).toMatchObject({ slot: "breakfast" });
  });

  it("reads her day back when that's what she asked for", () => {
    for (const text of [
      "how's my day looking?",
      "how am I doing",
      "what do I have left",
      "how much protein do I need",
      "am I on track",
    ]) {
      expect(localCoachIntent(text)).toMatchObject({ kind: "read" });
    }
  });

  it("understands the follow-ups", () => {
    expect(localCoachIntent("something lighter")).toMatchObject({ prefer: "lighter" });
    expect(localCoachIntent("more protein")).toMatchObject({ prefer: "protein" });
    expect(localCoachIntent("none of these")).toMatchObject({ kind: "more" });
  });
});

describe("asks that need the model", () => {
  it("hands over anything carrying detail of its own", () => {
    for (const text of [
      "what should I eat, I've only got chicken and rice",
      "is Chipotle ok tonight",
      "how many calories in a Chick-fil-A sandwich",
      "what should I order at an Italian place",
      "can I have pizza",
      "I'm at a wedding, what do I pick",
    ]) {
      expect(localCoachIntent(text)).toBeNull();
    }
  });

  it("never swallows a question that belongs to Callie", () => {
    for (const text of [
      "should I lower my calories",
      "my milk supply is down",
      "I've been dizzy all morning",
      "can I change my ranges",
      "when does my plan end",
    ]) {
      expect(localCoachIntent(text)).toBeNull();
    }
  });

  it("ignores empty and long input", () => {
    expect(localCoachIntent("")).toBeNull();
    expect(localCoachIntent("   ")).toBeNull();
    expect(localCoachIntent(null)).toBeNull();
    expect(localCoachIntent(`what should I eat ${"a".repeat(80)}`)).toBeNull();
  });
});
