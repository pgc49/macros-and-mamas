/**
 * How to use the app, answered in fixed sentences.
 *
 * Every label quoted in these answers is a real label in the client app.
 * Change a button, change its answer in COACH_HOW_TO too. Nothing is matched
 * unless she actually asks how or where, so "log this for lunch" is never a
 * tour, and anything a guardrail owns (supply, billing, symptoms) is left to
 * the guardrail.
 */

import { COACH_HOW_TO } from "../content/coachVoice.js";
import { classifyAsk } from "../../functions/_shared/coachGuardrails.js";

const ASKING = /\b(how (do|can|would|should|to|does)|where (do|can|is|are|would|did)|wheres|is there a way|show me how|what tab|which tab|can i (find|see|change|update|edit|delete|save|log|track|turn))\b/;

/** Asked about the coach itself, no "how" needed. */
const ABOUT_COACH = [
  /\bwhat (can|do) you (do|help( me)? with)\b/, /\bwhat (are you|is this|is the coach) (for|good at)\b/,
  /\bwhat can i (ask|use you for)\b/, /\bwhat is (this|the meal coach|meal coach)\b/,
  /\bhow (does|do) (this|the coach|the meal coach|you) work\b/, /\bhow (do i|to|should i) use (this|you|the coach|the meal coach)\b/,
  /\bare you (an? )?(ai|bot|robot|real|human|a person|callie|chatgpt|gpt|gemini)\b/, /\bis this (callie|a bot|ai|a real person)\b/,
  /\b(which|what) (ai|model|llm) (are you|is this)\b/, /\bwho (are you|am i talking to)\b/,
  /\bdoes callie (read|see) (this|these|my)\b/,
];

/** The guardrail answers these. A how-to here would talk over it. */
const NOT_HOW_TO = /\b(cancel|refund|billing|charged?|payment|subscription|pause|log ?in|sign ?in)\b/;

/** Things she might track that the app has no screen for. No tour of the wrong one. */
const NO_SCREEN = /\b(symptoms?|mood|period|cycle|sleep|steps|workouts?|exercise|water|baby|feeds?|feeding|pumping|milk|poop|diapers?)\b/;

const LOGGED = /\b(log|logged|entry|entries|something i (logged|added|ate)|what i (logged|added|ate))\b/;

const HOW_TO = [
  ["howWeight", /\b(log|track|enter|record|add|put in|update)\b[^.?]{0,12}\b(weight|weigh[- ]?ins?)\b/],
  ["howPassword", /\b(password|log ?out|sign ?out)\b/],
  ["howFoodPrefs", /\b(food preferences|preferences|food prefs|allerg(y|ies)|foods? i (don'?t|never) eat|dislikes)\b/],
  ["howNotify", /\bnotifications?\b/],
  ["howHelp", /\b(report (a )?(bug|problem)|found a bug|app (is )?(broken|glitch|not working)|tech support|app support|send feedback|give feedback)\b/],
  ["howMessage", /\b(message|text|contact|reach|talk to|dm|chat with|get a hold of|get ahold of) callie\b|\bmessages tab\b/],
  ["howProfile", /\b(edit|change|update)\b[^.?]{0,10}\b(my )?(profile|name|photo|picture|birthday|phone number)\b|\bmy profile\b/],
  ["howPlan", /\b(weekly planner|meal planner|plan (my|the|out) week|plan ahead|plan my meals|suggest my week)\b/],
  ["howPencil", /\bpencil/],
  ["howEdit", /\b(edit|change|fix|delete|remove|move|undo)\b/, LOGGED],
  ["howPast", /\b(see|view|log|look at|check|go to|add to|switch to|open)\b[^.?]{0,15}\b(yesterday|past days?|previous days?|last week|another day|other days?|earlier days?)\b/],
  ["howMyMeals", /\b(my meals|my own (meal|recipe)s?|save (a|my|this|that) (meal|recipe)|create a recipe|add a recipe|saved meals?)\b/],
  ["howProgress", /\b(progress tab|my progress|see progress|track progress|charts?)\b/],
  ["howRanges", /\b(see|find|check|view)\b[^.?]{0,15}\b(my )?(macros|ranges|numbers|totals)\b|\bwhere (are|is|do i see) my (macros|ranges|numbers|totals)\b/],
  ["howLog", /\b(log|track|record|enter|input) (a |my |what i |the |this |that )?(meal|food|snack|breakfast|lunch|dinner|eat|ate|it|this|that|everything)\b|\bhow (do|can) i (log|track)\b|\bhow to (log|track)\b|\badd (a |my )?(meal|food|snack|it|this|that) to (today|my log)\b/],
];

function normalize(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9 ?']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Admin is not here: "password" is on its list, and billing words are
// already turned away by NOT_HOW_TO.
const GUARDED = new Set(["crisis", "urgent", "supply", "ranges"]);

/** Which app how-to this is, or null. */
export function localCoachHowTo(raw) {
  const text = normalize(raw);
  if (!text || text.length > 160) return null;
  if (GUARDED.has(classifyAsk(raw).scope)) return null;
  if (ABOUT_COACH.some((re) => re.test(text))) return { kind: "teach", topic: "howCoach" };
  if (!ASKING.test(text) || NOT_HOW_TO.test(text) || NO_SCREEN.test(text)) return null;
  for (const [topic, pattern, also] of HOW_TO) {
    if (pattern.test(text) && (!also || also.test(text))) return { kind: "teach", topic };
  }
  return null;
}

export const HOW_TO_TOPICS = new Set(Object.keys(COACH_HOW_TO));

export function howToBody(topic) {
  return COACH_HOW_TO[topic] || "";
}
