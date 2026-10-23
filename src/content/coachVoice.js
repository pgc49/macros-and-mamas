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
  title: "Meal Coach",
  betaLabel: "Beta",
  // What it's for, that it isn't Callie, and where the rest goes. Kept to the
  // two lines a phone shows above the fold.
  betaNote:
    "Automated, not Callie. Ask about your next meal, eating out, a menu photo, or how to use the app.",
  betaNoteCallie:
    "Your ranges, the scale, supply, or how you're feeling: message Callie.",
  // A greeting, a test, a keyboard mash. No model call, one honest line.
  junkReply:
    "I'm here for your next meal. Ask me what to eat, send a photo of a menu, or ask how something in the app works.",
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
  teachRealFood:
    "Any real food can fit your macros. A slice of pizza is real food — water, yeast, flour, tomatoes, cheese. An Oreo is not; it's full of stuff made in a lab. We can make macros work for real food. If this one blows through fat, calories or carbs, next time log it ahead and keep breakfast and lunch lower fat or lower carb so it fits.",
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

  // A passing mention of nursing, before the food answer. A supply problem
  // is still a full handoff — this line is not that.
  nursingPreface:
    "Callie builds your macros with your supply at the center and it is always protected. If you ever notice a negative shift in your supply, please reach out to Callie directly immediately.",
  snackAsk:
    "Do you want me to suggest three meals and one snack, or three meals and two snacks? I can make both work with your macros.",
};

/**
 * How to use the app. Every quoted label is on screen today. Rename a button
 * and this has to change with it. `coachHowTo.test.js` checks the labels.
 */
export const COACH_HOW_TO = {
  howCoach:
    "I'm the Meal Coach. I'm automated, not Callie. She doesn't read these chats, but if something sounds medical or serious, she gets a short note so she can check in. I'm here for your next meal: what to eat with what's left today, what to order when you're out, or a photo of a menu. I can point you around the app, too. Anything else, like your ranges, the scale, supply, or how you're feeling, goes to Callie in Messages.",
  howLog:
    "On Today, go to Log a meal. Snap reads a photo of your plate or a menu, Describe lets you type it, My plan has your planned and saved meals, and Macros is for when you already know the numbers. Pick which meal it was, then save.",
  howEdit:
    "On Today, scroll to Today's log and tap the item. You can adjust it, move it to another meal, or tap remove.",
  howPast:
    "On Today, tap a day in the week strip above Log a meal, or use the arrows for another week. Anything you log then goes to that day.",
  howMyMeals:
    "Go to Meals, then My meals, then ＋ Add meal. You can create a recipe, describe a meal, or generate options. Saved meals show up under My plan when you log.",
  howPlan:
    "Go to Meals, then Weekly Planner. Add meals day by day, or tap Suggest my week. When you eat a planned meal, tap Add to Today.",
  howPencil:
    "Tap Pencil in on one of my meal cards to hold room for it before you eat. It shows in Today's log. Tap Ate it once you've had it, or Clear to drop it.",
  howRanges:
    "Your ranges are at the top of Today: Protein, Carbs, Fat, and Calories, each with what you've logged and what's left.",
  howProgress:
    "Progress has your weight by day and a chart of your macros against your ranges.",
  howWeight:
    "Go to Progress, pick the day, enter your Weight (lbs), and tap Log it.",
  howMessage:
    "Go to Messages and tap Callie. You can attach a photo or a PDF with the +.",
  howFoodPrefs:
    "Go to Meals, then Food prefs. That's where your preferences and allergies live, and I use them too.",
  howProfile:
    "Tap the circle at the top right to open Account, then Profile. Your name, photo, birthday, and goals are there.",
  howPassword:
    "Tap the circle at the top right to open Account. Password is under Profile, and Sign out is on Account.",
  howNotify:
    "Go to Messages. If notifications are off you'll see Turn on notifications; tap it and allow them. On iPhone, open the app from your Home Screen icon first.",
  howHelp:
    "Tap the circle at the top right, then Report a problem. Or use App help & feedback at the bottom of Today, Meals, or Progress.",
};

/**
 * The coach answers food and ranges. Everything else goes to Callie.
 * These are the exact lines it uses to say so.
 *
 * `links` are tappable lines drawn under the text, ahead of Message Callie.
 */
export const COACH_DEFLECT = {
  // Only when she says outright she might hurt herself or the baby. Calm, short,
  // and a person first. Never paired with food.
  crisis: {
    line:
      "I'm glad you said something. This is bigger than a meal, and you deserve to talk to a real person. You can call or text 988 any time. If you're in danger right now, call 911. And please message Callie too.",
    links: [
      { label: "Call 988", href: "tel:988" },
      { label: "Text 988", href: "sms:988" },
    ],
    cta: "Message Callie",
  },
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
    line: `That one's outside what I can help with. I'm here for your next meal and how the program works. Callie's your person for the rest. ${COACH_MESSAGE_HER}`,
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
