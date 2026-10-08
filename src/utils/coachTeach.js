/**
 * Callie's own answers, matched before a model is called.
 *
 * These are the questions she answered in her own words: eating out with no
 * numbers, skipping a meal, "is this ok", coffee, alcohol, fasting,
 * sweeteners, and finishing the day under. They are not guesses. A message
 * that matches one of these gets her sentence, instantly, with no request.
 *
 * A named restaurant we have not scripted, and a cuisine she has not locked,
 * is not one of these. Chipotle, Cava, Sweetgreen, and Mexican go to the
 * model. Italian, Chinese, sushi, pizza-as-a-meal, and In-N-Out are hers.
 */

import { COACH_COPY, underDayCopy } from "../content/coachVoice.js";

const TEACH_FIRST = [
  // Only the "should I skip" question. "I skipped lunch, what now" is food.
  ["neverSkip", /\bshould i (even )?(skip|skipping)\b[^.?]{0,24}\b(dinner|lunch|breakfast|snack|this meal|a meal|eating)\b/],
  ["neverSkip", /\b(skip|skipping)\b[^.?]{0,20}\b(dinner|lunch|breakfast|snack|this meal|a meal|eating)\b/],
  ["neverSkip", /\bshould i (even )?eat\b[^.?]{0,20}\b(over|overshot|over my)\b/],
  ["neverSkip", /\b(make up for it|over so)\b[^.?]{0,16}\bskip\b/],

  ["fasting", /\bintermittent fast/],
  ["fasting", /\b\b(16\s*[:x]\s*8|18\s*[:x]\s*6|omad)\b/],
  ["fasting", /\b(time[- ]restricted|one meal a day|fasting window)\b/],
  ["fasting", /\bshould i (try |start )?fast(ing)?\b/],

  // "cheers" and "drinks" are not alcohol. "Cheers, I hit my protein" is a day check.
  ["alcohol", /\b(alcohol|wine|cocktail|tequila|vodka|margarita|beer|whiskey|whisky|booze)\b/],
  ["alcohol", /\b(have|having|grab|order) (a |an )?(drink|cocktail)\b/],

  ["coffee", /\b(coffee|caffeine|espresso|latte|cold brew|americano)\b/],

  ["sweetener", /\b(artificial sweetener|aspartame|sucralose|stevia|splenda|diet coke|diet pepsi|zero sugar soda)\b/],

  ["waterEat", /\b(should i eat more|drink more water|water or eat more)\b/],
  ["everyDay", /\b(is this going to be like this every day|like this every day)\b/],
  ["underDay", /\b(under (my )?(calories|cals)|calories left|i hit my protein|protein('?s| is) (in|covered|done)|eat more or (leave|stop)|done for (the )?day)\b/],
];

const PS_METHOD = [
  /\b(eating out|eat out|restaurant|no nutrition|no (macro|calorie)s?\b|im out|we're out)\b/,
  /\bwhat (do i|should i) (order|get|pick)\b/,
];

const REAL_FOOD = [
  /\b(is|are) (a |an |some )?(pizza|slice|protein bar|bar|oreo|cookie|cookies|chips?|ice cream|treat|candy)\b.{0,16}\b(ok|okay|fine|allowed)\b/,
  /\bis pizza ok\b/,
  /\bcan i (have|eat) (a |an |some )?(pizza|slice|protein bar|bar|oreo|cookie|cookies|chips?|ice cream)\b/,
  /\bwhat about (a |an |some )?(pizza|wine|beer|oreo|protein bar|bar|slice)\b/,
];

const NAMED_DISH =
  /\b(pho|ramen|broth|noodles?|banh mi|pad thai|pad see ew|bibimbap|gyro|falafel|shawarma|poke)\b/;

const IN_N_OUT = /\b(in[- ]?n[- ]?out|inn n out|in and out)\b/;

const NAMED_RESTAURANT =
  /\b(chipotle|sweetgreen|sweet green|cava|panera|starbucks|mcdonalds|mcdonald's|chick[- ]?fil[- ]?a|olive garden|cheesecake factory|applebee'?s|chili'?s|subway|wendy'?s|taco bell|panda express|five guys|shake shack|dunkin|ihop|denny'?s)\b/;

const ITALIAN = /\bitalian\b(?! dressing)/;
const CHINESE = /\bchinese\b/;
const SUSHI = /\bsushi\b/;

// Pizza as the plate. "Is pizza ok" stays the real-food line, not this one.
const PIZZA_MEAL = [
  /\bpizza (for|as|tonight|today)\b/,
  /\b(having|ordering|getting|eating) pizza\b/,
  /\bpizza (dinner|lunch|night)\b/,
];

const OTHER_CUISINE =
  /\b(mexican|thai|japanese|indian|greek|mediterranean|korean|vietnamese|steakhouse|bbq|barbecue)\b/;

// Basics she said the bot can say. A meal question in the same sentence wins.
const STEPS = /\b(steps|step count|walk after (meals|a meal|breakfast|lunch|dinner)|walking after (meals|a meal|breakfast|lunch|dinner))\b/;
const MEAL_ASK = /\b(what should i eat|what (do|can|should) i (eat|have|get|order|make)|eat for|ideas for)\b/;

/** A pasted link is fetched on the server. This only catches "the menu" with nothing to read. */
export function hasMenuLink(raw) {
  return /https?:\/\/|\bwww\./i.test(String(raw || ""));
}

export function menuUnseen(raw) {
  if (hasMenuLink(raw)) return false;
  const text = normalize(String(raw || ""));
  return /\b(from (this|the) menu|on (this|the) menu|look at (this|the) menu|read (this|the) menu)\b/.test(text);
}

function normalize(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[’‘`']/g, "")
    .replace(/[^a-z0-9 :]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Which of Callie's teachings this message is, or null.
 *
 * Matched before the meal router and before a model call. A food question
 * that isn't one of these still goes through the usual path.
 */
export function alreadySkippedAsk(raw) {
  const text = normalize(raw);
  return /\bskipped\b/.test(text) && /\b(what now|what should i|eat now|what do i eat)\b/.test(text);
}

export function isLowIntakeAsk(raw) {
  const text = normalize(raw);
  return /\beat(ing)? this little\b/.test(text)
    || /\bthis little while (nursing|breastfeeding)\b/.test(text)
    || /\bok to eat this little\b/.test(text);
}

export function isNursingHungryAsk(raw) {
  const text = normalize(raw);
  return /\b(breastfeed|nursing|breast feeding)/.test(text) && /\b(always hungry|so hungry|starving)\b/.test(text);
}

export function isMetaCallieAsk(raw) {
  const text = normalize(raw);
  return /\bwhy do you keep (saying )?ask callie\b/.test(text)
    || /\bwhy (do you|are you) (keep )?(saying|telling me to) ask callie\b/.test(text);
}

export function localCoachTeach(raw) {
  // A link is fetched server-side. Saying "from this menu" with no link and
  // no photo is still a guess, so that one stays here.
  if (hasMenuLink(raw)) return null;
  if (alreadySkippedAsk(raw) || isLowIntakeAsk(raw) || isNursingHungryAsk(raw) || isMetaCallieAsk(raw)) {
    return null;
  }
  if (menuUnseen(raw)) return { kind: "teach", topic: "menuLink" };
  const text = normalize(raw);
  if (!text || text.length > 180) return null;
  for (const [topic, pattern] of TEACH_FIRST) {
    if (!pattern.test(text)) continue;
    if (topic === "alcohol" && /\b(nurs|breastfeed)\b/.test(text)) {
      return { kind: "teach", topic: "alcoholNursing" };
    }
    return { kind: "teach", topic };
  }
  // In-N-Out is locked. Every other named place still needs that menu.
  if (IN_N_OUT.test(text)) return { kind: "teach", topic: "inNOut" };
  if (NAMED_RESTAURANT.test(text)) return null;
  if (ITALIAN.test(text)) return { kind: "teach", topic: "italian" };
  if (CHINESE.test(text)) return { kind: "teach", topic: "chinese" };
  if (SUSHI.test(text)) {
    if (/\b(nurs|breastfeed|raw)\b/.test(text)) return { kind: "teach", topic: "sushiNursing" };
    return { kind: "teach", topic: "sushi" };
  }
  if (PIZZA_MEAL.some((pattern) => pattern.test(text))) return { kind: "teach", topic: "pizzaMeal" };
  if (OTHER_CUISINE.test(text)) return null;
  if (NAMED_DISH.test(text)) return null;
  if (STEPS.test(text) && !MEAL_ASK.test(text)) return { kind: "teach", topic: "steps" };
  for (const pattern of PS_METHOD) {
    if (pattern.test(text)) return { kind: "teach", topic: "psMethod" };
  }
  for (const pattern of REAL_FOOD) {
    if (pattern.test(text)) return { kind: "teach", topic: "realFood" };
  }
  return null;
}

export function teachBody(topic, ctx = {}) {
  if (topic === "psMethod") return COACH_COPY.teachPs;
  if (topic === "italian") return COACH_COPY.teachItalian;
  if (topic === "chinese") return COACH_COPY.teachChinese;
  if (topic === "sushi") return COACH_COPY.teachSushi;
  if (topic === "sushiNursing") return COACH_COPY.teachSushiNursing;
  if (topic === "waterEat") return COACH_COPY.teachWaterEat;
  if (topic === "everyDay") return COACH_COPY.teachEveryDay;
  if (topic === "pizzaMeal") return COACH_COPY.teachPizzaMeal;
  if (topic === "inNOut") return COACH_COPY.teachInNOut;
  if (topic === "steps") return COACH_COPY.teachSteps;
  if (topic === "menuLink") return COACH_COPY.teachMenuLink;
  if (topic === "menuClosed") return COACH_COPY.teachMenuClosed;
  if (topic === "menuMiss") return COACH_COPY.teachMenuMiss;
  if (topic === "neverSkip") {
    return ctx.again ? COACH_COPY.teachNeverSkipAgain : COACH_COPY.teachNeverSkip;
  }
  if (topic === "skippedMeal") return COACH_COPY.teachSkippedMeal;
  if (topic === "lowIntake") return COACH_COPY.teachLowIntake;
  if (topic === "nursingHungry") return COACH_COPY.teachNursingHungry;
  if (topic === "metaCallie") return COACH_COPY.teachMetaCallie;
  if (topic === "realFood") {
    if (ctx.notLogging) return COACH_COPY.teachRealFood;
    return `${COACH_COPY.teachRealFood} ${COACH_COPY.teachRealFoodLogAhead}`;
  }
  if (topic === "alcohol") return COACH_COPY.teachAlcohol;
  if (topic === "alcoholNursing") return COACH_COPY.teachAlcoholNursing;
  if (topic === "coffee") return COACH_COPY.teachCoffee;
  if (topic === "fasting") return COACH_COPY.teachFasting;
  if (topic === "sweetener") return COACH_COPY.teachSweetener;
  if (topic === "underDay") {
    return underDayCopy({
      fatEaten: ctx.totals?.f ?? ctx.fatEaten ?? 0,
      carbsShort: Boolean(ctx.carbsShort),
    });
  }
  return "";
}

/**
 * Topics that, asked a third time in one day, go to Callie instead of
 * getting the same sentence again. "What should I eat" is not a pain point.
 */
export const PAIN_TOPICS = new Set(["neverSkip", "fasting", "supply", "care", "urgent"]);

export function countTeachInThread(thread, topic) {
  if (!topic) return 0;
  return (thread || []).filter((m) => m.role === "coach" && (m.teach === topic || m.deflect === topic)).length;
}
