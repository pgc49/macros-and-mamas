/**
 * Maya 13-ask + live-bank contract. Deterministic classify + fallback.
 * No live writes. Over-limit uses the same plates and prose-last rule.
 */
import { describe, expect, it } from "vitest";

import { classifyAsk, deflectForScope, isMoodAsk } from "./coachGuardrails.js";
import {
  alignReplyToMeals,
  buildCoachFallbackMeals,
  ensureFoodMeals,
  replyPlateContract,
  warmMealReply,
} from "./coachFoodFallback.js";
import { extractAskConstraints, filterCoachMeals, mealHaystack } from "./coachMealFilter.js";
import { capPriorAskChars, threadPriorAsks } from "./coachMealFilter.js";
import { alreadySkippedAsk, isLowIntakeAsk, isMetaCallieAsk, isNursingHungryAsk, localCoachTeach } from "../../src/utils/coachTeach.js";
import { COACH_GUILT_LINE, COACH_MOOD_FOLLOW, COACH_MOOD_LINE, leadLimitReply, moodDeflectLine } from "../../src/content/coachVoice.js";
import { restaurantFromAsk } from "../../src/utils/coachIntent.js";

const MAYA = [
  "ive been crying every day this week and i dont really know why",
  "ok. i just dont want to bother anyone",
  "honestly is this going to be like this every day",
  "one hand, no dairy pls (baby gets fussy)",
  "so sick of chicken lol",
  "is the wrap enough protein for nursing tho?",
  "pumped way less today than last week, freaking out a little. is it something im eating?",
  "is the broth ok for supply? and should i skip the noodles or no",
  "my mom is bringing over pho, what should i get",
  "nvm we have ground beef and rice at home",
  "no dairy for baby",
  "tired of chicken",
  "what can I make",
];

function play(text, priorAsks, { limited = false } = {}) {
  const verdict = classifyAsk(text, { priorAsks });
  const teach = localCoachTeach(text);
  const slot = /\b(bedtime|walk|snack)\b/i.test(text) ? "snack" : "dinner";
  const filled = ensureFoodMeals([], {
    text,
    slot,
    mode: restaurantFromAsk(text) ? "menu" : "ask",
    priorAsks,
    count: 3,
  });
  let meals = filled.meals;
  let reply = filled.reply;
  if (verdict.scope === "mood" || verdict.follow) {
    const deflect = deflectForScope(verdict.scope, text, { follow: verdict.follow === true });
    if (deflect === "mood" || deflect === "moodFollow") {
      meals = isMoodAsk(text) && !/\b(eat|dinner|lunch|breakfast|snack)\b/i.test(text) && !verdict.follow
        ? []
        : (verdict.follow ? [] : meals);
      reply = deflect === "moodFollow" ? COACH_MOOD_FOLLOW : COACH_MOOD_LINE;
    }
  }
  if (limited && meals.length) reply = leadLimitReply(reply, { hasPlates: true });
  reply = alignReplyToMeals(reply, meals);
  return { verdict, teach, meals, reply, contract: replyPlateContract(reply, meals) };
}

describe("Maya 13-ask replay", () => {
  it("covers mood lock, dairy, supply, pho, wrap, nvm beef, and plate contract", () => {
    const prior = [];
    const turns = MAYA.map((text) => {
      const turn = play(text, prior);
      prior.push(text);
      return { text, ...turn };
    });

    expect(turns[0].verdict.scope).toBe("mood");
    expect(turns[0].meals).toEqual([]);
    expect(turns[0].reply).toBe(COACH_MOOD_LINE);

    expect(turns[1].verdict.scope).toBe("mood");
    expect(turns[1].verdict.follow).toBe(true);
    expect(turns[1].meals).toEqual([]);
    expect(turns[1].reply).toBe(COACH_MOOD_FOLLOW);

    expect(turns[2].verdict.scope).toBe("mood");
    expect(turns[2].meals).toEqual([]);

    const dairyHay = turns[3].meals.map((meal) => mealHaystack(meal)).join(" ");
    expect(dairyHay).not.toMatch(/\b(cheese|yogurt|milk|butter)\b/i);
    expect(turns[3].meals.length).toBeGreaterThanOrEqual(2);

    const chickenHay = turns[4].meals.map((meal) => mealHaystack(meal)).join(" ");
    expect(chickenHay).not.toMatch(/\bchicken\b/i);

    expect(turns[5].reply).toMatch(/^Yes/i);
    expect(turns[5].teach).toBeNull();

    expect(turns[6].verdict.scope).toBe("supply");
    expect(turns[7].verdict.scope).toBe("supply");
    expect(turns[7].reply).toMatch(/broth is fine for supply/i);
    expect(turns[7].teach).toBeNull();

    expect(turns[8].teach).toBeNull();
    expect(turns[8].meals.every((meal) => meal.orderOnly || /pho/i.test(meal.name))).toBe(true);
    expect(turns[8].reply).toMatch(/pho|broth|noodle/i);

    expect(turns[9].meals.map((meal) => meal.name).join(" ")).toMatch(/ground beef|beef/i);
    expect(turns[9].reply).not.toMatch(/Rice and fruit/i);

    for (const turn of turns) {
      expect(turn.contract.ok, `${turn.text} → ${turn.reply}`).toBe(true);
      expect(turn.reply).not.toMatch(/^Or /);
      expect(turn.reply).not.toMatch(/ Or [A-Z]/);
    }
  });

  it("holds the same filters over the daily limit", () => {
    const prior = MAYA.slice(0, 4);
    const turn = play("so sick of chicken lol", prior, { limited: true });
    expect(turn.meals.length).toBeGreaterThanOrEqual(2);
    expect(turn.meals.map((meal) => mealHaystack(meal)).join(" ")).not.toMatch(/\b(chicken|cheese stick|yogurt)\b/i);
    expect(turn.reply).toMatch(/That's all the thinking I've got for today/);
    expect(turn.contract.ok).toBe(true);
  });
});

describe("live-bank L1–L8 contracts", () => {
  it("does not scold a mama who already skipped", () => {
    expect(alreadySkippedAsk("I skipped lunch, what now")).toBe(true);
    expect(localCoachTeach("I skipped lunch, what now")).toBeNull();
    const filled = ensureFoodMeals([], { text: "I skipped lunch, what now", slot: "lunch" });
    expect(filled.meals.length).toBeGreaterThanOrEqual(2);
    expect(filled.reply).toMatch(/Eat now/i);
    expect(filled.reply).not.toMatch(/Absolutely not/);
    expect(filled.reply).not.toMatch(/protein shake/i);
    expect(replyPlateContract(filled.reply, filled.meals).ok).toBe(true);
  });

  it("treats eat-this-little-while-nursing as food, not pizza", () => {
    expect(isLowIntakeAsk("is it ok to eat this little while nursing")).toBe(true);
    expect(localCoachTeach("is it ok to eat this little while nursing")).toBeNull();
    const filled = ensureFoodMeals([], { text: "is it ok to eat this little while nursing", slot: "dinner" });
    expect(filled.reply).toMatch(/eat more/i);
    expect(filled.reply).not.toMatch(/Oreo|pizza is real food/i);
    expect(filled.meals.length).toBeGreaterThanOrEqual(2);
    expect(filled.meals.every((meal) => !/pizza/i.test(meal.name))).toBe(true);
  });

  it("answers Starbucks and Chick-fil-A with order cards", () => {
    for (const ask of ["what's good at Starbucks", "Chick-fil-A for lunch, what should I get"]) {
      const meals = buildCoachFallbackMeals({ text: ask, slot: "lunch", mode: "menu" });
      expect(meals.length).toBeGreaterThanOrEqual(2);
      expect(meals.every((meal) => meal.orderOnly && meal.source === "menu")).toBe(true);
      const reply = warmMealReply(meals, ask);
      expect(reply).not.toMatch(/do not have|don't have .{0,20}menu/i);
      expect(replyPlateContract(reply, meals).ok).toBe(true);
    }
  });

  it("puts the no-shame line and a real answer on guilt and meta asks", () => {
    const guilt = ensureFoodMeals([], { text: "I ate half a sleeve of cookies, what now", slot: "dinner" });
    expect(guilt.reply).toMatch(COACH_GUILT_LINE);
    expect(guilt.meals.length).toBeGreaterThanOrEqual(2);
    expect(isMetaCallieAsk("why do you keep saying ask Callie")).toBe(true);
    const meta = ensureFoodMeals([], { text: "why do you keep saying ask Callie", slot: "dinner" });
    expect(meta.reply).toMatch(/Food questions I answer here/i);
    expect(meta.meals.length).toBeGreaterThanOrEqual(2);
    expect(isNursingHungryAsk("I'm breastfeeding and always hungry")).toBe(true);
    const hungry = ensureFoodMeals([], { text: "I'm breastfeeding and always hungry", slot: "dinner" });
    expect(hungry.reply).toMatch(/Nursing burns a lot/i);
    expect(hungry.reply).not.toMatch(/^Here's .+, .+, and /);
  });

  it("drops high-carb plates on a low-carb ask", () => {
    const meals = buildCoachFallbackMeals({ text: "low carb dinner", slot: "dinner" });
    expect(meals.length).toBeGreaterThanOrEqual(2);
    expect(meals.every((meal) => (Number(meal.c) || 0) <= 36)).toBe(true);
    expect(meals.every((meal) => !/teriyaki/i.test(meal.name))).toBe(true);
  });

  it("matches bedtime, pre-walk, and sweet asks", () => {
    const bed = buildCoachFallbackMeals({ text: "bedtime snack", slot: "snack" });
    expect(bed.every((meal) => !/teriyaki|salmon dinner|taco bowl/i.test(meal.name))).toBe(true);
    const walk = buildCoachFallbackMeals({ text: "something before a walk", slot: "snack" });
    expect(walk.length).toBeGreaterThanOrEqual(2);
    const sweet = buildCoachFallbackMeals({ text: "something sweet", slot: "snack" });
    expect(sweet.every((meal) => /yogurt|fruit|banana|cottage|shake/i.test(mealHaystack(meal)))).toBe(true);
    const reply = warmMealReply(sweet, "something sweet");
    expect(replyPlateContract(reply, sweet).ok).toBe(true);
  });

  it("rewrites prose when a plate is dropped so names stay on screen", () => {
    const meals = [{ name: "Turkey skillet" }, { name: "Salmon and rice" }];
    const reply = alignReplyToMeals("Here's Tuna pouch wrap, Turkey skillet, or Salmon and rice.", meals);
    expect(reply).not.toMatch(/Tuna pouch wrap/i);
    expect(replyPlateContract(reply, meals).ok).toBe(true);
  });

  it("caps prior asks around 2500 and keeps constraint asks first", () => {
    const asks = Array.from({ length: 40 }, (_, i) => `ask number ${i} ${"x".repeat(180)}`);
    asks[0] = "no dairy pls baby gets fussy";
    const capped = capPriorAskChars(threadPriorAsks(asks));
    expect(capped.join(" ").length).toBeLessThanOrEqual(2500);
    expect(capped[0]).toMatch(/no dairy/);
  });

  it("reads dairy and sick-of from short wording", () => {
    expect(extractAskConstraints("no dairy pls").noDairy).toBe(true);
    expect(extractAskConstraints("baby gets fussy with dairy").noDairy).toBe(true);
    expect(extractAskConstraints("so sick of chicken lol").noChicken).toBe(true);
    expect(extractAskConstraints("tired of chicken").noChicken).toBe(true);
    const cheese = { name: "Protein bar and cheese stick", ingredients: [{ item: "cheese stick" }], reason: "A bar and a cheese stick." };
    expect(filterCoachMeals([cheese], { text: "no dairy for baby" })).toEqual([]);
  });

  it("uses the cleaner mood-note splice", () => {
    expect(moodDeflectLine(true)).toContain("I've added a note for Callie. Please tell her too, and your doctor or midwife.");
    expect(moodDeflectLine(true)).not.toMatch(/I've added a note for Callie, and please tell her,/);
  });
});
