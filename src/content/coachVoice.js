/**
 * Every string the meal coach says. Callie edits here.
 *
 * House rules, from Callie:
 * - A friend who happens to be a coach. Plain words, contractions, no guilt.
 * - Exclamation points are fine when something is worth saying firmly
 *   (never skip a meal!). Don't sprinkle them.
 * - No emojis. Never "cheat", never "bad", never "simply".
 * - Never call the coach an AI or a bot. The screen says Meal Coach.
 *   Marketing already says Callie is not a bot.
 * - All three macros matter. Fat is the one that decides weight loss — more
 *   than double the calories of protein or carbs — so it stays in its band.
 *   Protein and carbs can go over when fat does not.
 * - Protein is a floor: 10–20g over the top is fine, more than that is
 *   unnecessary. We never eat less than 50g of fat in a day.
 * - Never skip a meal. A half portion is fine when the full portion is
 *   offered next to it, so she can choose.
 * - Snack count follows her habit. One if she usually has one, two if she
 *   usually has two, and ask when there isn't a pattern yet.
 */

export const COACH_NAME = "Meal Coach";

/** She has to tap Message Callie. The bot does not send this for her. */
export const COACH_MESSAGE_HER = "Message Callie and she'll get back to you.";

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
  title: "Meal Coach",
  betaLabel: "Beta",
  betaNote:
    "Next meal, eating out, or a photo of the menu or fridge. Ranges, the scale, supply, and workouts stay with Callie.",
  callieReads:
    "Callie reads these chats too, including anything you delete, so she can step in when you need her.",
  removeMessage: "Remove",
  loadFailed: "I couldn't load today's chat. Try again.",
  retryLoad: "Try again",
  askTimeout: "That took too long. Try me again.",
  retryAsk: "Try me again",
  entryTitle: "Not sure what to eat?",
  entryCta: "Ask the coach",

  // Composer
  placeholder: "Ask about a meal…",
  placeholderBusy: "One sec…",
  send: "Send",
  addPhoto: "Attach a photo",
  photoMenu: "Menu",
  photoFridge: "Fridge",
  photoReadyMenu: "Menu photo ready",
  photoReadyKitchen: "Kitchen photo ready",
  photoRemove: "Remove photo",
  showNumbers: "Show numbers again",
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

  // Why this plate, or nothing. Stock lines stay here only so an old thread
  // payload can be recognized and silenced. New cards never use them.
  reasonFills: "Hits protein and leaves",
  reasonFillsTail: "g fat.",
  reasonGets: "Hits protein and keeps fat in range.",
  reasonMost: "Most of your protein —",
  reasonMostTail: "short, easy to pick up later.",
  reasonFits: "Fits what's left. Fat stays in range.",
  reasonOver: "Simple and lighter. Fat stays in check.",
  reasonFatLeft: "Leaves",
  reasonFatLeftTail: "g fat.",
  reasonProteinOpenTail: "of protein still open.",

  // What the coach knows about her
  knowsPencilled: "Pencilled in earlier",
  knowsUsualSlot: "One of your usuals at",
  knowsUsual: "One of your usuals",
  knowsLike: "You like",
  knowsPantry: "Quick one from your staples",
  knowsOffSlot: "Usually",

  // Sources
  sourceBank: "Callie's recipe",
  sourceMy: "My meals",
  sourcePantry: "Pantry",
  sourceMenu: "From the menu",
  sourceKitchen: "From your kitchen",
  sourceNew: "Made for you",
  sourceNewBySlot: {
    breakfast: "Made for breakfast",
    lunch: "Made for lunch",
    dinner: "Made for dinner",
    snack: "Made for a snack",
  },
  adminSavedMeal: "her saved meal",

  // Results
  noneFit:
    "None of Callie's recipes fit tonight at a normal portion. Tell me what you've got and I'll build something.",
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
    "For Italian, protein and a side: fish with some potatoes and broccoli, or meatballs and a veggie.",
  teachChinese:
    "For Chinese, a stir-fry: animal protein, veggies, and rice, light on the sauce.",
  teachSushi:
    "For sushi, nigiri and some soup.",
  teachPizzaMeal:
    "Pizza is the meal. You don't need a protein and a side next to it.",
  teachInNOut:
    "Is this for pure enjoyment, or do you want it to fit your macros? If you want it to fit: a Protein Style burger, no spread, ketchup or mustard. If you get fries, have half the little basket, or a quarter.",
  teachSteps:
    "Getting your steps in, and a walk after meals, is a good basic.",
  teachMenuLink:
    "I won't guess a menu I can't see. Send a photo of it.",
  teachMenuClosed:
    "I couldn't open that link, so I won't guess the menu. Send a photo of it.",
  teachMenuMiss:
    "I opened the link, but I won't name a dish I couldn't find on the page. Send a photo of the menu.",
  teachNeverSkip:
    "Absolutely not. You never skip a meal! The goal isn't to nail your macros every single time — it's to nourish yourself and learn how to fuel your body. Eat something simple and lower calorie: grilled chicken and rice, or even a protein shake. Follow your hunger, too. Some days you burned more, and those days need more.",
  teachNeverSkipAgain:
    "Still eat something tonight, even if it's small. Greek yogurt with berries or a protein shake is enough when nothing sounds good.",
  teachRealFood:
    "Any real food can fit your macros. A slice of pizza is real food — water, yeast, flour, tomatoes, cheese. An Oreo is not; it's full of stuff made in a lab. We can make macros work for real food.",
  teachRealFoodLogAhead:
    "If this one blows through fat, calories or carbs, next time log it ahead and keep breakfast and lunch lower fat or lower carb so it fits.",
  teachAlcohol:
    "Alcohol is up to you — no judgment either way. If you want a drink, we can fit it in your macros. Keep fat in range, that's the one that adds up, and have it with food, not on an empty stomach.",
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

  // Only when she raises supply or a supply drop — not every nursing mention.
  nursingPreface:
    "Callie builds your plan around your supply, and protecting it always comes first. If you ever notice it dropping, message her right away.",
  snackAsk:
    "Do you want me to suggest three meals and one snack, or three meals and two snacks? I can make both work with your macros.",
};

/**
 * The coach answers food and ranges. Everything else goes to Callie.
 * These are the exact lines it uses to say so.
 */
/**
 * Off until Patrick/Callie approve. Do not append this to a mama-facing
 * medical handoff without that yes.
 */
export const INCLUDE_COACH_DOCTOR_SENTENCE = false;
export const COACH_DOCTOR_SENTENCE = "If it feels serious or gets worse, call your doctor.";
export const INCLUDE_MATERNAL_MENTAL_HEALTH_HOTLINE = false;
export const COACH_MATERNAL_HOTLINE =
  "The National Maternal Mental Health Hotline is 1-833-852-6262 (call or text, 24/7, free).";

const COACH_MEDICAL_CORE =
  "Oh no, I'm sorry you're feeling that way. That one's for Callie, not me, and I don't want you waiting on it, so please message her now.";
const COACH_MEDICAL_TAIL = "In the meantime, sip some water and have something simple:";

export function medicalDeflectLine() {
  return INCLUDE_COACH_DOCTOR_SENTENCE
    ? `${COACH_MEDICAL_CORE} ${COACH_DOCTOR_SENTENCE} ${COACH_MEDICAL_TAIL}`
    : `${COACH_MEDICAL_CORE} ${COACH_MEDICAL_TAIL}`;
}

const COACH_MEDICAL_LINE = medicalDeflectLine();

export const COACH_MOOD_LINE =
  "I'm so sorry. That's a lot to carry, and you don't have to push through it alone. Crying a lot in the weeks after a baby is really common, and it's very treatable. Please tell Callie, and your doctor or midwife too. Postpartum Support International's helpline is 1-800-944-4773 (call or text). If you ever feel unsafe, call or text 988.";
export const COACH_MOOD_FOOD = "And whenever you're ready, here's something easy to eat:";

export function moodDeflectLine(noted = false, { hasFood = false } = {}) {
  let line = COACH_MOOD_LINE;
  if (noted === true) {
    line = line.replace(
      "Please tell Callie, and your doctor or midwife too.",
      "I've added a note for Callie, and please tell her, and your doctor or midwife too.",
    );
  }
  if (INCLUDE_MATERNAL_MENTAL_HEALTH_HOTLINE) {
    line = line.replace(
      "1-800-944-4773 (call or text).",
      `1-800-944-4773 (call or text). ${COACH_MATERNAL_HOTLINE}`,
    );
  }
  if (hasFood) line = `${line} ${COACH_MOOD_FOOD}`;
  return line;
}

/**
 * Crisis / postpartum warning signs. ON by default. One constant so
 * Patrick and Callie can tweak it without hunting through the panel.
 */
export const INCLUDE_COACH_EMERGENCY_LINE = true;
export const COACH_BUSY_LINE =
  "I can't think straight right now. Try again in a minute, or pick something from Meals.";
export const COACH_LIMIT_LINE = "That's all the thinking I've got for today.";
export const COACH_LIMIT_SPENT =
  "That's all the thinking I've got for today. Callie's recipes are all in Meals whenever you want them.";
export const COACH_LIMIT_FOOD =
  "That's all the thinking I've got for today, but here are a few easy ones.";
export const COACH_LIMIT_PHOTO =
  "I can't look at photos again until tonight, but here are a few easy ones.";
export const COACH_GUILT_LINE = "One day doesn't change anything, and you still eat.";
export const COACH_WATER_SNACK = "Have some water.";
export const COACH_FINE_TUNING_LINE =
  "Callie's still fine-tuning your numbers, so here's an easy one for now.";
export const COACH_LOCAL_PICKS_LINE = "Here are a few easy ones that work for today.";

/** Careful lines. Each ends by leading into plates so she never hits a stop. */
export const COACH_SUPPLY_LINE =
  "I'm sorry, that's really stressful. Your supply always comes first. If you think it's dropping, message Callie and she'll get back to you. In the meantime, here are a few easy ones:";
export const COACH_DISORDERED_LINE =
  "I'm really glad you told me. Callie would love to hear from you directly. Message her whenever you're ready. For now, here's something simple:";
export const COACH_DISORDERED_LINE_NOTED =
  "I'm really glad you told me. I've added a note for Callie, and she'd love to hear from you directly too. Message her whenever you're ready. For now, here's something simple:";
export const COACH_MEDICATION_LINE =
  "That one's for your doctor or pharmacist, not me. Let Callie know too so she can plan around it. Here's something easy in the meantime:";

/** Only claim the note when the pin or flag write succeeded on this request. */
export function disorderedDeflectLine(noted) {
  return noted ? COACH_DISORDERED_LINE_NOTED : COACH_DISORDERED_LINE;
}

export function coachDeflectLine(deflect, { noted = false, hasFood = false } = {}) {
  if (deflect === "disordered") return disorderedDeflectLine(noted === true);
  if (deflect === "mood") return moodDeflectLine(noted === true, { hasFood });
  return (COACH_DEFLECT[deflect] || COACH_DEFLECT.offTopic).line;
}

function normalizeCoachApostrophes(text) {
  return String(text || "").replace(/[\u2018\u2019\u201B]/g, "'");
}

export function leadFineTuningReply(reply, { hasPlates = false } = {}) {
  const lead = normalizeCoachApostrophes(COACH_FINE_TUNING_LINE);
  const rest = normalizeCoachApostrophes(String(reply || "")).trim();
  if (!hasPlates) {
    if (!rest) return "";
    if (rest.startsWith(lead)) return rest.slice(lead.length).trim().slice(0, 400);
    return rest.slice(0, 400);
  }
  if (!rest) return lead;
  if (rest.startsWith(lead)) return rest.slice(0, 400);
  return `${lead} ${rest}`.trim().slice(0, 400);
}

export function leadLimitReply(reply, { hasPlates = false, photo = false } = {}) {
  const rest = String(reply || "").trim();
  if (photo && hasPlates) {
    if (!rest || rest.startsWith(COACH_LIMIT_PHOTO) || rest.startsWith(COACH_LIMIT_LINE)) {
      return COACH_LIMIT_PHOTO;
    }
    return `${COACH_LIMIT_PHOTO} ${rest}`.trim().slice(0, 400);
  }
  if (hasPlates) {
    if (!rest || rest.startsWith(COACH_LIMIT_FOOD) || rest.startsWith(COACH_LIMIT_LINE)) {
      return COACH_LIMIT_FOOD;
    }
    return `${COACH_LIMIT_FOOD} ${rest}`.trim().slice(0, 400);
  }
  if (!rest) return COACH_LIMIT_SPENT;
  if (rest.startsWith(COACH_LIMIT_LINE)) return rest.slice(0, 400);
  return `${COACH_LIMIT_LINE} ${rest}`.trim().slice(0, 400);
}

export const COACH_EMERGENCY_LINE =
  "Please get help right now. If this feels like an emergency, call 911. If you're having thoughts of hurting yourself or your baby, call or text 988. Then call your doctor. Callie will see this, but maybe not right away, so please don't wait for her.";

export const COACH_DEFLECT = {
  callie: {
    line: COACH_PASS,
    cta: "Message Callie",
  },
  emergency: {
    line: INCLUDE_COACH_EMERGENCY_LINE ? COACH_EMERGENCY_LINE : COACH_MEDICAL_LINE,
    cta: "Message Callie too",
  },
  medical: {
    line: medicalDeflectLine(),
    cta: "Message Callie",
  },
  mood: {
    line: COACH_MOOD_LINE,
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
    line: `That's something Callie can sit with better than I can. ${COACH_MESSAGE_HER}`,
    cta: "Message Callie",
  },
  supply: {
    line: COACH_SUPPLY_LINE,
    cta: "Message Callie",
  },
  disordered: {
    line: COACH_DISORDERED_LINE,
    lineNoted: COACH_DISORDERED_LINE_NOTED,
    cta: "Message Callie",
  },
  medication: {
    line: COACH_MEDICATION_LINE,
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

/**
 * Hormonal-health note when a meal was actually skipped.
 * An empty log is not enough — she may have eaten and not logged.
 */
export function skipMealCopy(skipped = [], { saidSkipped = false, loggedOtherMeals = false } = {}) {
  const slots = (skipped || []).filter(Boolean);
  if (!slots.length) return "";
  if (!saidSkipped && !loggedOtherMeals) return "";
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

/** Names already checked against the fetched page. The model does not get to add one. */
export function menuFromPageCopy(names = []) {
  const list = names.map((name) => String(name || "").trim()).filter(Boolean).slice(0, 3);
  if (!list.length) return COACH_COPY.teachMenuMiss;
  return `From the page: ${list.join(", ")}. Order what's printed, and ask for dressing or sauce on the side if it's creamy.`;
}

export function askForSlotCopy(slot) {
  if (slot === "lunch") return "Looking for a lunch idea?";
  if (slot === "dinner") return "Looking for a dinner idea?";
  if (slot === "snack") return "Looking for a snack idea?";
  if (slot === "breakfast") return "Looking for a breakfast idea?";
  return COACH_COPY.entryTitle;
}
