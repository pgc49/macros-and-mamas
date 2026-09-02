/**
 * Callie-facing strings for Help me decide.
 * She edits here. No guilt, no exclamation points, no emojis.
 */

export const CALLIE_VOICE = {
  friend: "A friend who happens to be a coach. Plain words, contractions.",
  protein: "Protein is the win. Fat and carbs are ceilings, not enemies.",
  never: ["guilt", "cheat", "bad", "just", "simply", "the AI"],
};

export const DECIDE_SLOT_PHRASE = {
  breakfast: "this morning",
  lunch: "at lunch",
  dinner: "tonight",
  snack: "for a snack",
};

export const DECIDE_SLOT_LABEL = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "a snack",
};

export const DECIDE_COPY = {
  title: "Help me decide",
  headerKnows: "Knows your prefs, your saved meals, your log",
  barDinnerAsk: "Know what dinner is yet? I'll size it to what's left.",
  captionLink: "Help me decide",
  back: "Back to logging",
  logIt: "Log it",
  pencilIn: "Pencil in",
  notSureYet: "Not sure yet",
  pencilledHint: "Pencilled in · tap when you've eaten it",
  ateIt: "Ate it",
  change: "change",
  editPrefs: "edit",
  afterThis: "After this",
  doneToday: "Done for today",
  knowDinner: "Know what dinner is yet?",
  dinnerAsk: "Know what dinner is yet? I'll size it to what's left.",
  lastMealLead: "Last meal of the day.",
  lastMealRest: "Everything that's left is yours",
  savingRoom: "Saving room for",
  usualEat: "the way you usually eat it",
  normalShare: "using a normal share",
  thatLeaves: "That leaves",
  pencilledIn: "is pencilled in",
  forSlot: "For",
  savedFor: "Saved for",
  snackRoomOne: "Save room for a snack",
  snackRoomMany: "Save room for snacks",
  pencilledBox: "pencilled in",
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
  toastLogged: "Logged to",
  saveToMine: "Save to My meals",
  fridgeThird: "Tell me what's in the fridge and I'll build a third.",
  browseEverything: "Browse everything",
  fridgeInstead: "Want to tell me what's in the fridge instead?",
  noneOfThese: "None of these",
  lighter: "Lighter",
  moreProtein: "More protein",
  quick: "Quick",
  pickForMe: "Pick for me",
  kitchen: "From my kitchen",
  eatingOut: "Eating out",
  comingSoon: "That's next. For now, Pick for me uses your bank and what's left.",
  usingPrefs: "Using your prefs",
  reasonFills: "Fills your protein, leaves",
  reasonFillsTail: "g fat.",
  reasonGets: "Gets protein into range. Fits everything else.",
  reasonMost: "Most of your protein. Add a yogurt later and you're there.",
  reasonOver: "Light and protein forward.",
  knowsPencilled: "Pencilled in earlier",
  knowsUsualSlot: "One of your usuals at",
  knowsUsual: "One of your usuals",
  knowsLike: "You like",
  knowsPantry: "Quick one from your staples",
  knowsClose: "Close to what you usually eat",
  viaBank: "From Help me decide",
  viaAi: "Made from your fridge",
  viaOut: "Estimate from menu",
};

export function snackRoomCopy(count) {
  return Number(count) === 1 ? DECIDE_COPY.snackRoomOne : DECIDE_COPY.snackRoomMany;
}

/** Right-box CTA for the next unlogged main slot. Dinner string stays the default. */
export function knowLaterCopy(slot) {
  if (slot === "lunch") return "Know what lunch is yet?";
  if (slot === "snack") return "Know what snack is yet?";
  if (slot === "breakfast") return "Know what breakfast is yet?";
  return DECIDE_COPY.knowDinner;
}
