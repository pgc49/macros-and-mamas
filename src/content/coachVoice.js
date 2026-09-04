/**
 * Every string the meal coach says. Callie edits here.
 *
 * House rules: a friend who happens to be a coach. Plain words, contractions,
 * no guilt, no exclamation points, no emojis. Protein is the win; fat and carbs
 * are ceilings, not enemies. Never the words "cheat", "bad", "just", "simply",
 * and never call the coach an AI.
 */

export const COACH_NAME = "Coach";

export const COACH_SLOT_PHRASE = {
  breakfast: "this morning",
  lunch: "at lunch",
  dinner: "tonight",
  snack: "for a snack",
};

export const COACH_SLOT_LABEL = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "a snack",
};

export const COACH_SLOT_TITLE = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export const COACH_COPY = {
  title: "Coach",
  tagline: "Knows your ranges, your log, and what you like",
  entryTitle: "Not sure what to eat?",
  entryCta: "Ask your coach",

  // Composer
  placeholder: "Ask about a meal…",
  placeholderBusy: "One sec…",
  send: "Send",
  addPhoto: "Add a photo",
  photoMenu: "Menu",
  photoFridge: "Fridge",
  photoRemove: "Remove photo",
  thinking: "Thinking",

  // Openers
  openerLead: "Hey.",
  openerFresh: "Nothing logged yet today, so the whole day is open.",
  openerDone: "You're done for today as far as I can tell.",

  // Quick asks
  askEat: "What should I eat?",
  askOut: "I'm eating out",
  askKitchen: "What's in my kitchen",
  askDay: "How's my day looking?",

  // Card actions
  logIt: "Log it",
  pencilIn: "Pencil in",
  ateIt: "Ate it",
  seeRecipe: "See recipe",
  saveToMine: "Save to My meals",
  savedToMine: "Saved to My meals",
  close: "Close",
  notThese: "None of these",
  lighter: "Lighter",
  moreProtein: "More protein",
  showMore: "Show me others",

  // Card chrome
  pencilledHint: "Pencilled in · tap when you've eaten it",
  estimateNote: "Rough estimate — adjust after if the plate looked different",
  proteinOver: "Puts you over the top of protein, which is fine",

  // Budget reads
  proteinCovered: "Protein's covered",
  proteinNeed: "You need about",
  proteinNeedTail: "of protein",
  proteinShy: "You're",
  proteinShyTail: "shy on protein",
  easyClose: "Easy to close.",
  fatSpent: "Fat's nearly spent, so lean protein and carbs. Go light on oil and cheese.",
  carbsClose: "Carbs are close to done. Protein and veg.",
  calTightLead: "About",
  calTightTail: "cal to work with. Protein first.",
  plenty: "Plenty of room. Protein first, then whatever sounds good.",
  over:
    "You're past your ranges for today. That's fine, one day doesn't change anything. If you're hungry, these stay light and protein forward.",

  // Budget sentence
  savingRoom: "Saving room for",
  usualEat: "the way you usually eat it",
  normalShare: "using a normal share",
  thatLeaves: "That leaves",
  pencilledIn: "is pencilled in",
  lastMealLead: "Last meal of the day.",
  lastMealRest: "Everything that's left is yours",
  snackReserveOne: "a snack",
  snackReserveMany: "snacks",
  leftFor: "Left for",
  holdingLead: "Holding",
  overStrip: "Everything but protein is spent for today. Protein's still worth getting.",
  overStripDone: "You're past your ranges for today, protein included.",

  // Why a card is here
  reasonFills: "Fills your protein, leaves",
  reasonFillsTail: "g fat.",
  reasonGets: "Gets protein into range. Fits everything else.",
  reasonMost: "Most of your protein —",
  reasonMostTail: "short, easy to pick up later.",
  reasonFits: "Fits what's left. Protein is still open.",
  reasonOver: "Light and protein forward.",

  // What the coach knows about her
  knowsPencilled: "Pencilled in earlier",
  knowsUsualSlot: "One of your usuals at",
  knowsUsual: "One of your usuals",
  knowsLike: "You like",
  knowsPantry: "Quick one from your staples",
  knowsOffSlot: "Usually",

  // Sources
  sourceBank: "Callie's bank",
  sourceMy: "My meals",
  sourcePantry: "Pantry",
  sourceMenu: "From the menu",
  sourceKitchen: "From your kitchen",
  sourceNew: "Built for what's left",

  // Results
  noneFit:
    "Nothing in the bank fits what's left at a normal portion. Tell me what you've got and I'll build something.",
  seenAll: "That's everything that fits, so here's the round again.",
  browseEverything: "Browse everything",
  fridgeThird: "Tell me what's in your kitchen and I'll build a third.",
  loggedShort: "Logged.",
  pencilledShort: "Pencilled in.",
  logFailed: "That didn't save. Try again in a second.",

  // Honesty
  estimateLead: "That's an estimate, not a label read.",
  cantSeeIt: "I can't read that photo well enough to put numbers on it.",
  noNumbers: "I'm not going to make up numbers for that one.",
};

/**
 * The coach answers food and ranges. Everything else goes to Callie.
 * These are the exact lines it uses to say so.
 */
export const COACH_DEFLECT = {
  callie: {
    line: "That one's Callie's. She knows your history and I'd only be guessing.",
    cta: "Ask Callie",
  },
  care: {
    line:
      "I'm not the one for that — I only know food and your ranges. Callie's better placed to help, and if it's not letting up, your doctor is.",
    cta: "Ask Callie",
  },
  ranges: {
    line:
      "Your ranges are Callie's call, not mine. I'll work with whatever she has you on. Want to ask her about changing them?",
    cta: "Ask Callie",
  },
  weight: {
    line:
      "I'd rather not put a number on that one. Callie's the person for it — that's the part of this she does with you.",
    cta: "Ask Callie",
  },
  admin: {
    line: "Anything about your plan, your billing or your dates is Callie's, not mine.",
    cta: "Ask Callie",
  },
  offTopic: {
    line: "I only do food and your ranges. That one's outside what I'm good for.",
    cta: "Ask Callie",
  },
};

export const COACH_ASK_CALLIE_PREFILL = "Hi Callie — a question from the coach:";

export function snackReserveCopy(count) {
  return Number(count) === 1 ? COACH_COPY.snackReserveOne : COACH_COPY.snackReserveMany;
}

export function capitalizeLine(text) {
  const s = String(text || "");
  const i = s.search(/\S/);
  if (i < 0) return s;
  return s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
}

/** Ask copy for the next unlogged slot. */
export function askForSlotCopy(slot) {
  if (slot === "lunch") return "Know what lunch is yet?";
  if (slot === "dinner") return "Know what dinner is yet?";
  if (slot === "snack") return "Know what snack is yet?";
  if (slot === "breakfast") return "Know what breakfast is yet?";
  return COACH_COPY.entryTitle;
}
