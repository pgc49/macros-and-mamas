/**
 * Every string the meal coach says. Callie edits here.
 *
 * House rules, from Callie:
 * - A friend who happens to be a coach. Plain words, contractions, no guilt.
 * - Exclamation points are fine when something is worth saying firmly
 *   (never skip a meal!). Don't sprinkle them.
 * - No emojis. Never "cheat", never "bad", never "simply".
 * - Never call the coach an AI. It is Coach Callie's Bot, and it says so.
 * - All three macros matter. Fat is the one that decides weight loss — more
 *   than double the calories of protein or carbs — so it stays in its band.
 *   Protein and carbs can go over when fat does not.
 * - Protein is a floor: 10–20g over the top is fine, more than that is
 *   unnecessary. We never eat less than 50g of fat in a day.
 * - Never skip a meal.
 */

export const COACH_NAME = "Coach Callie's Bot";

/** She has to tap Message Callie. The bot does not send this for her. */
export const COACH_MESSAGE_HER = "Message her and she'll get back to you.";

export const COACH_PASS =
  `That's something Callie might be better able to answer than me. ${COACH_MESSAGE_HER}`;

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
  title: "Coach Callie's Bot",
  tagline: "Knows your ranges, your log, and what you like",
  entryTitle: "Not sure what to eat?",
  entryCta: "Ask the coach",

  // Composer
  placeholder: "Ask about a meal…",
  placeholderBusy: "One sec…",
  send: "Send",
  addPhoto: "Attach a photo",
  photoMenu: "Menu",
  photoFridge: "Fridge",
  photoRemove: "Remove photo",
  thinking: "Thinking",

  // Openers
  openerLead: "Hey.",
  openerFresh: "Nothing logged yet today, so the whole day is open.",
  openerDone: "You're done for today as far as I can tell.",

  // Quick asks. Two of these open a photo picker, so they say so — "What's in
  // my kitchen" read like a question the coach would answer, then the camera
  // came up unannounced.
  askEat: "What should I eat?",
  askOut: "Photo of the menu",
  askKitchen: "Photo of my fridge",
  askDay: "How's my day looking?",

  // What her own message says once the photo is on its way. The chip label is
  // an instruction; this is her sentence, and it should sound like one.
  sentMenu: "I'm eating out — here's the menu",
  sentFridge: "Here's what's in my fridge",

  // Card actions
  logIt: "Log it",
  pencilIn: "Pencil in",
  ateIt: "Ate it",
  clearPencil: "Clear",
  seeRecipe: "See recipe",
  seeOrder: "How to order",
  saveToMine: "Save to My meals",
  savedToMine: "Saved to My meals",
  close: "Close",
  recipeWhat: "What's in it",
  recipeHow: "How to make it",
  // A restaurant plate has no method, only an order. Saying "how to make it"
  // over "ask for the jus on the side" reads like the coach isn't looking.
  recipeOrder: "How to order it",
  notThese: "None of these",
  lighter: "Lighter",
  moreProtein: "More protein",
  showMore: "Show me others",

  // Card chrome
  pencilledHint: "Pencilled in · tap when you've eaten it",
  countPencilled: "Include pencilled meals",
  countPencilledHint: "Includes what you pencilled in — not logged yet.",
  totalsWithPencilsUnder: "With pencilled meals you'd still have room in your ranges.",
  totalsWithPencilsIn: "With pencilled meals you'd land inside your ranges.",
  totalsWithPencilsOver: "With pencilled meals you'd be a touch over — you can still change it.",
  estimateNote: "Rough estimate — adjust after if the plate looked different",
  // 10–20g over the day's protein high is fine. Past that it is just extra.
  proteinOver: "A bit over on protein, which is fine",
  proteinOverMuch: "That's more protein than you need. Keep fat in range and you're good.",

  // Budget reads
  proteinCovered: "Protein's covered",
  proteinNeed: "You need about",
  proteinNeedTail: "of protein",
  proteinShy: "You're",
  proteinShyTail: "shy on protein",
  easyClose: "Easy to close.",
  fatSpent: "Fat's nearly spent, so keep oil, cheese and dressings light. Protein and carbs can still go over.",
  carbsClose: "Carbs are close to the top. Fine if fat stays in range.",
  calTightLead: "About",
  calTightTail: "cal to work with. Watch the fat — that's the one that adds up.",
  plenty: "Plenty of room. Hit your protein, and keep fat in its band.",
  over:
    "You're past your ranges for today. One day doesn't change anything, and you still eat. If you're hungry, these stay lighter and keep fat in check.",

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
  overStrip: "Fat and calories are spent for today. You still eat — keep the next plate simple.",
  overStripDone: "You're past your ranges for today. You still eat.",

  // Why a card is here. Fat is the one she is watching; protein is a floor.
  reasonFills: "Hits protein and leaves",
  reasonFillsTail: "g fat.",
  reasonGets: "Hits protein and keeps fat in range.",
  reasonMost: "Most of your protein —",
  reasonMostTail: "short, easy to pick up later.",
  reasonFits: "Fits what's left. Fat stays in range.",
  reasonOver: "Simple and lighter. Fat stays in check.",

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

  // Callie's teachings — the sentences she would actually say.
  teachPs:
    "Use the PS method: protein and a side. Roasted chicken, a burger, steak — then rice, salad or potatoes. Eating out makes it really hard not to blow through fat, so do your best. Dressing on the side, and dip your fork as you go.",
  teachItalian:
    "For Italian, protein and a side: roasted chicken or fish, and pasta with tomato sauce as the side — not the main. Pasta is low protein, so it sits next to the protein rather than filling the plate.",
  teachNeverSkip:
    "Absolutely not. You never skip a meal! The goal isn't to nail your macros every single time — it's to nourish yourself and learn how to fuel your body. Eat something simple and lower calorie: grilled chicken and rice, or even a protein shake. Follow your hunger, too. Some days you burned more, and those days need more.",
  teachRealFood:
    "Any real food can fit your macros. A slice of pizza is real food — water, yeast, flour, tomatoes, cheese. An Oreo is not; it's full of stuff made in a lab. We can make macros work for real food. If this one blows through fat, calories or carbs, next time log it ahead and keep breakfast and lunch lower fat or lower carb so it fits.",
  teachAlcohol:
    "Alcohol is up to you. We don't encourage it and we don't say absolutely not. If you have a drink, keep fat in range — that's the one that adds up — and drink it with food, not on an empty stomach.",
  teachCoffee:
    "Coffee is allowed — Callie has a cup or two a day — but never on an empty stomach. Have it with breakfast. And after about 7 hours, half the caffeine is still in your blood, so if falling asleep is hard, it may be the afternoon cup.",
  teachFasting:
    "No intermittent fasting. When we skip meals the body leans on cortisol, a stress hormone, to stay energized, and that pulls from the same nutrients your sex hormones need. We eat consistently and we fill up at our meals.",
  teachSweetener:
    "I'd encourage skipping artificial sweeteners — they're not something we want daily. If a Diet Coke is a real thing for you, try an Olipop vintage cola instead. One swap, no lecture.",
  teachUnderLead:
    "If you've eaten three square meals, you can leave the rest. Follow your hunger. We never want to eat less than 50g of fat in a day — hormones really do need it.",
  teachUnderFat: "You're under 50g of fat so far, so get some in if you can.",
  teachUnderCarbs: "Have you eaten your carbs too?",

  // She skipped a meal the clock already went past. Don't silently spend
  // that room — say what skipping does, then feed the rest of the day.
  skipNotice:
    "I noticed you skipped a meal. We really want to eat consistently for hormonal health. When we skip, the body can use cortisol — a stress hormone — to keep going, and that takes the same nutrients from our sex hormones. Eat a real lunch, a larger snack, and a larger dinner so you still reach your goals.",
  skipBreakfastHint:
    "Mornings can be busy, and a small appetite is often a blunted metabolism talking. Try starting with a protein shake if a full breakfast isn't easy yet.",
};

/**
 * The coach answers food and ranges. Everything else goes to Callie.
 * These are the exact lines it uses to say so.
 */
export const COACH_DEFLECT = {
  callie: {
    line: COACH_PASS,
    cta: "Message Callie",
  },
  care: {
    line: `That's something Callie might be better able to sit with than me. ${COACH_MESSAGE_HER}`,
    cta: "Message Callie",
  },
  ranges: {
    line: `Your ranges are Callie's call, not mine. ${COACH_MESSAGE_HER}`,
    cta: "Message Callie",
  },
  weight: {
    line: `I'd rather not put a number on that one. ${COACH_MESSAGE_HER}`,
    cta: "Message Callie",
  },
  admin: {
    line: `Anything about your plan, your billing or your dates is Callie's. ${COACH_MESSAGE_HER}`,
    cta: "Message Callie",
  },
  offTopic: {
    line: `I only do food and your ranges. ${COACH_MESSAGE_HER}`,
    cta: "Message Callie",
  },
  supply: {
    line:
      `We protect your supply first, always. Your ranges already use the gentler calorie math for that. If you think your supply is being affected, that's something Callie might be better able to answer than me. ${COACH_MESSAGE_HER}`,
    cta: "Message Callie",
  },
  again: {
    line: `You've come back to this a couple of times. That's something Callie might be better able to sit with than me. ${COACH_MESSAGE_HER}`,
    cta: "Message Callie",
  },
};

/** Seed for her composer — first person, not a bot forwarding a ticket. */
export const COACH_ASK_CALLIE_PREFILL = "Hi Callie —";

export function snackReserveCopy(count) {
  return Number(count) === 1 ? COACH_COPY.snackReserveOne : COACH_COPY.snackReserveMany;
}

export function capitalizeLine(text) {
  const s = String(text || "");
  const i = s.search(/\S/);
  if (i < 0) return s;
  return s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
}

/** Hormonal-health note when a meal the clock passed was never logged. */
export function skipMealCopy(skipped = []) {
  const slots = (skipped || []).filter(Boolean);
  if (!slots.length) return "";
  return slots.includes("breakfast")
    ? `${COACH_COPY.skipNotice} ${COACH_COPY.skipBreakfastHint}`
    : COACH_COPY.skipNotice;
}

/**
 * End of day, protein in, calories left. Callie wants the fat floor asked
 * about, and carbs too, rather than a blanket "eat more" or "you're done".
 */
export function underDayCopy({ fatEaten = 0, carbsShort = false } = {}) {
  const bits = [COACH_COPY.teachUnderLead];
  if (Number(fatEaten) < 50) bits.push(COACH_COPY.teachUnderFat);
  if (carbsShort) bits.push(COACH_COPY.teachUnderCarbs);
  return bits.join(" ");
}

/** Ask copy for the next unlogged slot. */
export function askForSlotCopy(slot) {
  if (slot === "lunch") return "Looking for a lunch idea?";
  if (slot === "dinner") return "Looking for a dinner idea?";
  if (slot === "snack") return "Looking for a snack idea?";
  if (slot === "breakfast") return "Looking for a breakfast idea?";
  return COACH_COPY.entryTitle;
}
