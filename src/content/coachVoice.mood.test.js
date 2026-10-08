import { describe, expect, it } from "vitest";

import {
  COACH_DEFLECT,
  COACH_MOOD_FOOD,
  COACH_MOOD_LINE,
  COACH_MESSAGE_HER,
  INCLUDE_COACH_DOCTOR_SENTENCE,
  INCLUDE_MATERNAL_MENTAL_HEALTH_HOTLINE,
  medicalDeflectLine,
  moodDeflectLine,
} from "./coachVoice.js";

describe("Lifecycle mood and medical copy", () => {
  it("uses the mood line word for word", () => {
    expect(COACH_MOOD_LINE).toBe(
      "I'm so sorry. That's a lot to carry, and you don't have to push through it alone. Crying a lot in the weeks after a baby is really common, and it's very treatable. Please tell Callie, and your doctor or midwife too. Postpartum Support International's helpline is 1-800-944-4773 (call or text). If you ever feel unsafe, call or text 988.",
    );
    expect(moodDeflectLine(false)).toBe(COACH_MOOD_LINE);
    expect(INCLUDE_MATERNAL_MENTAL_HEALTH_HOTLINE).toBe(false);
  });

  it("prefixes the Callie note only when the write succeeded", () => {
    expect(moodDeflectLine(true)).toBe(
      "I'm so sorry. That's a lot to carry, and you don't have to push through it alone. Crying a lot in the weeks after a baby is really common, and it's very treatable. I've added a note for Callie. Please tell her too, and your doctor or midwife. Postpartum Support International's helpline is 1-800-944-4773 (call or text). If you ever feel unsafe, call or text 988.",
    );
    expect(moodDeflectLine(false)).not.toMatch(/I've added a note/);
    expect(moodDeflectLine(true)).not.toMatch(/she'll get back|reply soon/i);
  });

  it("adds the food follow-on only when she also asked about food", () => {
    expect(moodDeflectLine(false, { hasFood: true })).toBe(`${COACH_MOOD_LINE} ${COACH_MOOD_FOOD}`);
    expect(moodDeflectLine(false, { hasFood: false })).toBe(COACH_MOOD_LINE);
    expect(COACH_MOOD_FOOD).toBe("And whenever you're ready, here's something easy to eat:");
  });

  it("uses the medical handoff word for word and never names a food", () => {
    expect(INCLUDE_COACH_DOCTOR_SENTENCE).toBe(false);
    expect(medicalDeflectLine()).toBe(
      "Oh no, I'm sorry you're feeling that way. That one's for Callie, not me, and I don't want you waiting on it, so please message her now. In the meantime, sip some water and have something simple:",
    );
    expect(COACH_DEFLECT.medical.line).toBe(medicalDeflectLine());
    expect(medicalDeflectLine()).not.toMatch(/chicken|yogurt|rice|toast|eggs?/i);
    expect(COACH_DEFLECT.medical.line).not.toBe(
      "That's one for Callie, not me, and I don't want you waiting on it. Message her now.",
    );
  });

  it("never says I only do food, and names Callie before her", () => {
    expect(JSON.stringify(COACH_DEFLECT)).not.toMatch(/I only do food and your ranges/);
    expect(COACH_MESSAGE_HER).toMatch(/Callie/);
    expect(COACH_DEFLECT.offTopic.line).toMatch(/Callie/);
    expect(COACH_DEFLECT.offTopic.line).not.toMatch(/I only do food/);
  });
});
