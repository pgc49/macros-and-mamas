/**
 * Callie's own answers, matched before a model is called.
 *
 * These are the questions she answered in her own words: eating out with no
 * numbers, skipping a meal, "is this ok", coffee, alcohol, fasting,
 * sweeteners, and finishing the day under. They are not guesses. A message
 * that matches one of these gets her sentence, instantly, with no request.
 *
 * A named restaurant or cuisine is not one of these. "What should I get at
 * In-N-Out" and "what can I eat for Italian" need the actual place, not the
 * canned PS-method or Oreo line.
 */

import { COACH_COPY, underDayCopy } from "../content/coachVoice.js";

const TEACH_FIRST = [
  // Never skip — before the restaurant patterns, so "skip dinner because I'm
  // out" is still a skip, not a PS-method question.
  ["neverSkip", /\b(skip|skipping|skipped)\b[^.?]{0,20}\b(dinner|lunch|breakfast|snack|this meal|a meal|eating)\b/],
  ["neverSkip", /\bshould i (even )?eat\b[^.?]{0,20}\b(over|overshot|over my)\b/],
  ["neverSkip", /\b(make up for it|over so)\b[^.?]{0,16}\bskip\b/],

  ["fasting", /\bintermittent fast/],
  ["fasting", /\b\b(16\s*[:x]\s*8|18\s*[:x]\s*6|omad)\b/],
  ["fasting", /\b(time[- ]restricted|one meal a day|fasting window)\b/],
  ["fasting", /\bshould i (try |start )?fast(ing)?\b/],

  ["alcohol", /\b(alcohol|wine|cocktail|tequila|vodka|margarita|beer|cheers|drinks?)\b/],

  ["coffee", /\b(coffee|caffeine|espresso|latte|cold brew|americano)\b/],

  ["sweetener", /\b(artificial sweetener|aspartame|sucralose|stevia|splenda|diet coke|diet pepsi|zero sugar soda)\b/],

  ["underDay", /\b(under (my )?(calories|cals)|calories left|hit( my)? protein|protein('?s| is) (in|covered|done)|should i eat more|eat more or (leave|stop)|done for (the )?day)\b/],
];

const PS_METHOD = [
  /\b(eating out|eat out|restaurant|no nutrition|no (macro|calorie)s?\b|im out|we're out)\b/,
  /\bwhat (do i|should i) (order|get|pick)\b/,
];

const REAL_FOOD = [
  /\b(is|are) [^.?]{0,28}\b(ok|okay|fine|allowed)\b/,
  /\bcan i (have|eat) (a |an |some )?(pizza|slice|protein bar|bar|oreo|cookie|cookies|chips?|ice cream)\b/,
  /\bwhat about (a |an |some )?(pizza|wine|beer|oreo|protein bar|bar|slice)\b/,
];

const NAMED_RESTAURANT =
  /\b(in[- ]?n[- ]?out|inn n out|in and out|chipotle|sweetgreen|sweet green|cava|panera|starbucks|mcdonalds|mcdonald's|chick[- ]?fil[- ]?a|olive garden|cheesecake factory|applebee'?s|chili'?s|subway|wendy'?s|taco bell|panda express|five guys|shake shack|dunkin|ihop|denny'?s)\b/;

const ITALIAN = /\bitalian\b(?! dressing)/;

const OTHER_CUISINE =
  /\b(mexican|chinese|thai|japanese|indian|greek|mediterranean|korean|vietnamese|sushi|steakhouse|bbq|barbecue)\b/;

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
export function localCoachTeach(raw) {
  const text = normalize(raw);
  if (!text || text.length > 180) return null;
  for (const [topic, pattern] of TEACH_FIRST) {
    if (pattern.test(text)) return { kind: "teach", topic };
  }
  // A named place needs that menu, not the canned eating-out sentence.
  if (NAMED_RESTAURANT.test(text)) return null;
  if (ITALIAN.test(text)) return { kind: "teach", topic: "italian" };
  if (OTHER_CUISINE.test(text)) return null;
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
  if (topic === "neverSkip") return COACH_COPY.teachNeverSkip;
  if (topic === "realFood") return COACH_COPY.teachRealFood;
  if (topic === "alcohol") return COACH_COPY.teachAlcohol;
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
