/* ==================================================================
   /functions/_shared/coachGuardrails.js — what the coach will not answer
   ==================================================================
   The coach does food and macro ranges. Everything else is Callie's.

   This runs before the model, not after it, so an out-of-scope question
   never reaches a model at all — no cost, no chance of an answer we then
   have to suppress, and the deflection is the same every time.

   The model prompt repeats these rules as a second layer, and the model
   can return scope "callie" on its own. Neither layer is trusted alone.
   ================================================================== */

/**
 * urgent   — symptoms, medication, mental health, restriction. Never answered,
 *            never paired with meal cards, no matter how the question is worded.
 * ranges   — her numbers are Callie's to set.
 * weight   — the scale is Callie's conversation, not a chatbot's.
 * admin    — plan, billing, dates, approval.
 * off_topic— plainly not food: fitness, sleep, the baby, or being asked to be
 *            a general assistant.
 * supply   — breastfeeding output. Always Callie's. We protect supply first.
 * unclear  — none of the above and no food word either. "Is Chipotle ok
 *            tonight?" is a food question with no food word in it, and
 *            refusing it would fail the mama at exactly the moment she needs
 *            the coach. These go to the model, which is told to hand anything
 *            that isn't food back to Callie.
 *
 * The four refusal lists are what carry the guarantee, and they run first.
 * Nothing that is Callie's reaches a model regardless of how the rest reads.
 */
export const COACH_SCOPES = ["food", "unclear", "urgent", "ranges", "weight", "admin", "off_topic", "supply"];

/**
 * Crisis and postpartum warning signs. These get the emergency line, not
 * the ordinary medical handoff. Idioms like "dying for tacos" or "this
 * workout is killing me" must not match — keep the phrases specific.
 */
const CRISIS = [
  // Suicide / self-harm — not "die for" / "dying for" / "to die for" a food
  /\bi want to die\b(?!\s+for\b)/,
  /\bwant to die\b(?!\s+for\b)/,
  /\b(thoughts of|thinking about) hurt(ing)? myself\b/,
  /\bwant to hurt myself\b/,
  /\bcut(ting)? myself\b/,
  /\bdon'?t want to be here(?=\s+anymore\b|[.!?]|$)/,
  /\bdo not want to be here(?=\s+anymore\b|[.!?]|$)/,
  /\bsuicid/,
  /\bself[- ]harm/,
  /\bend my life\b|\bend it all\b/,
  /\bkill myself\b/,
  // Harm the baby
  /\bhurt(ing)? (the |my )?baby\b/,
  /\bharm(ing)? (the |my )?baby\b/,
  // Chest / breathing
  /\bchest (pain|hurts?|tight)/,
  /\b(trouble|difficulty|hard time) breath/,
  /\bcan'?t breathe\b/,
  /\bshort(ness)? of breath\b/,
  // Fainted / passed out stay crisis. Bare "faint" / "feel faint" are medical.
  /\bfaint(ed|ing)\b/,
  /\bpass(ed|ing) out\b/,
  /\bblack(ed|ing)? out\b/,
  // Heavy bleeding
  /\bsoak(ing|ed)? (through )?(pads?|maxi)/,
  /\b(large |big )clots?\b/,
  /\bheavy bleed/,
  /\bh(a)?emorrhag/,
  // Headache + vision (preeclampsia warning)
  /\b(severe |bad |worst )?headache\b.{0,40}\b(vision|blurry|blurred|spots)\b/,
  /\b(vision|blurry|blurred).{0,40}\b(headache|head)\b/,
  /\bblurred vision\b/,
  /\bvision (is |got )?(blurry|changes?)\b/,
  // DVT
  /\b(one |my )?(left |right )?(swollen|painful) (and )?(painful |swollen )?(leg|calf)\b/,
  /\b(leg|calf) (is |feels )?(swollen|painful)/,
  /\b(legs?|calves|calf) (is|are|feels?) (swollen|painful)/,
  /\bone of my legs?\b.{0,40}\b(swollen|painful)/,
  // Seizure
  /\bseizure/,
  // Psychosis
  /\bhearing things\b/,
  /\bseeing things\b/,
  /\b(hear|see)ing? (things |voices )?(that aren'?t|that are not) there\b/,
  /\bhallucin/,
  // Racing heart with chest pain or shortness of breath
  /\b(racing|pounding) heart\b.{0,40}\b(chest|breath|breathe)/,
  /\bheart (is )?(racing|pounding)\b.{0,40}\b(chest|breath|breathe)/,
];

const URGENT = [
  ...CRISIS,
  // Ordinary symptoms — medical line, not 911
  /\bhurt(ing)? myself\b/,
  /\bfaint\b/,
  /\b(haven'?t|have not|not) (been )?slept?\b.{0,24}\b(for )?(days|a few days|two days|2 days|3 days)\b/,
  /\bnot sleep(ing)? for days\b/,
  /\bhaven'?t slept in days\b/,
  /\bdizz(y|iness)\b/, /\blight[- ]?headed\b/,
  /\bpalpitation/,
  /\b(racing|pounding) heart\b/,
  /\bheart (is )?(racing|pounding)\b/,
  /\bheart races\b(?!\s+when\b)/,
  /\bbleed(ing)?\b/,
  /\bfever\b/, /\bmigraine/, /\bnumbness\b/, /\brash\b/,
  /\bvomit/, /\bnause(a|ous|ated)\b/,
  /\bthrow(s|ing|n)? up\b/, /\bthrew up\b/,
  /\bdiarrh/, /\bconstipat/, /\bcontractions\b/, /\bpreeclamp/,
  /\b(high blood pressure|hypertension)\b/,
  /\bblood pressure is high\b/,
  /\bblood pressure\b.{0,32}\b(was|is|got|has been)\b.{0,16}\bhigh\b/,
  /\bmastitis\b/,
  /\bbreast.{0,48}\b(red|hot|hard).{0,48}\bfever/,
  /\b(red|hot) incision\b/,
  /\bincision.{0,24}\b(red|hot|swollen|infected)/,
  /\b(haven'?t|have not|not) (been )?eat(en|ing)? all day\b/,
  /\b(didn'?t|did not) eat all day\b/,
  /\b(haven'?t|have not|didn'?t|did not|not)\b.{0,32}\beat(en|ing)?\b.{0,24}\ball day\b/,
  /\bcry(ing)? all day\b/,
  // Restriction that is not an idiom
  /\bonly eating\b.{0,24}\b\d{2,4}\s*(calories?|cals?)\b/,
  /\beating (only )?\d{2,4}\s*(calories?|cals?)\b/,
  // Medication and clinical management
  /\bmedication\b/, /\bprescri/, /\bantibiotic/, /\bmetformin\b/, /\bozempic\b/,
  /\bsemaglutide\b/, /\bwegovy\b/, /\bzoloft\b/, /\bssri\b/, /\bbirth control\b/,
  /\bthyroid\b/, /\blevothyroxine\b/, /\bsupplements?\b/, /\bprenatals?\b/,
  /\bcreatine\b/, /\bmagnesium\b/, /\biron pills?\b/,
  // Diagnoses and testing
  /\bdiagnos/, /\bblood ?work\b/, /\bblood test/, /\blab (result|work)/,
  /\bdiabet/, /\bgestational\b/, /\bpcos\b/, /\bceliac\b/, /\bibs\b/, /\bgallbladder\b/,
  /\bdoctor\b/, /\bob[- ]?gyn\b/, /\bmidwife\b/, /\bpediatrician\b/,
  /\bpregnan/, /\btrimester\b/,
  // Mental health (without the crisis phrases above)
  /\banxiety\b/, /\banxious\b/, /\bdepress/, /\bppd\b/, /\bpanic attack/,
  /\btherapist\b/,
  // Restriction and disordered eating.
  //
  // Three of these are idioms before they are symptoms, and the literal
  // versions refused the mamas this was built for. "I'm nursing so I'm always
  // starving" is a hungry woman asking for breakfast; only the reflexive form
  // is about restriction. "I'm not eating enough protein" is the whole point
  // of the app. And a food she finds disgusting is a preference, not shame.
  /\bbinge/, /\bpurge/, /\bpurging\b/, /\banorexi/, /\bbulimi/,
  /\bstarv(e|es|ed|ing)\s+(myself|my ?self|my body)\b/, /\bstarvation\b/,
  /\bnot eating\b(?![^.?!]{0,24}\b(protein|carbs?|fats?|fibre|fiber|veg|vegetables|breakfast|lunch|dinner|meat|dairy|gluten)\b)/,
  /\bstop eating\b/, /\bskip(ping)? meals\b/, /\bfast(ing)? all day\b/,
  /\bhate my body\b/, /\bpunish/,
  /\b(i (feel|look|am)|feeling|felt)\b[^.?!]{0,18}\bdisgusting\b/,
  /\bhow (few|little) calories can i\b/, /\beat as little as\b/,
];

const RANGES = [
  /\b(change|adjust|lower|raise|increase|reduce|recalculat|redo|update)\b[^.?!]{0,30}\b(macro|range|target|calorie|protein|carb|fat)/,
  /\b(macro|range|target)s?\b[^.?!]{0,30}\b(too (high|low)|wrong|not right|feel off)/,
  /\bwhy (are|is) my (macros|ranges|calories|protein|carbs|fat)\b/,
  /\bcan i (have|get) (more|fewer|less) (calories|carbs|protein|fat)\b/,
  /\bnew (macros|ranges)\b/, /\brecalculate\b/,
];

const WEIGHT = [
  /\b(lose|losing|lost|gain(ing)?)\b[^.?!]{0,20}\b(weight|pounds?|lbs?|kilos?|kg)\b/,
  /\bweight ?loss\b/, /\bplateau/, /\bthe scale\b/, /\bscale (went|is) up\b/,
  /\bgoal weight\b/, /\bhow (much|fast|long)\b[^.?!]{0,25}\b(lose|weight|results?)\b/,
  /\bwhy (am i|aren'?t i) (not )?losing\b/, /\bbody fat( percentage)?\b/,
];

const ADMIN = [
  /\brefund/, /\bcancel/, /\bbilling\b/, /\bcharged?\b/, /\bsubscription\b/,
  /\bpayment\b/, /\binvoice\b/, /\bcohort\b/, /\bpassword\b/,
  // "My plan" is the week plan more often than it is the thing she pays for.
  /\b(cancel|change|upgrade|downgrade|pause|renew)\b[^.?!]{0,15}\bmy plan\b/,
  /\bmy plan\b[^.?!]{0,25}\b(cost|price|renew|expires?|ends?|starts?|finish|over|include)\b/,
  /\blog ?in\b/, /\bsign ?in\b/, /\bapprove/, /\bapproval\b/,
  /\bweek \d+\b[^.?!]{0,20}\bstart/, /\bwhen does\b[^.?!]{0,25}\b(program|course|cohort)\b/,
  /\bcallie hasn'?t\b/, /\bhear back from callie\b/,
];

/**
 * Shame about what she ate. On its own this is Callie's. If she also asks
 * what to eat next, the food gets answered and this rides along after.
 */
const GUILT = [
  /\bfeel guilty\b/,
  /\bfeel(ing)? (awful|bad|terrible|so bad) about\b/,
  /\bguilty (about|for)\b/,
];

const NEXT_MEAL = /\b(what should i eat|what (do|can|should) i (eat|have|get|order)|what to eat next|eat next|for (breakfast|lunch|dinner)|what'?s for (breakfast|lunch|dinner))\b/;

/** Eating the workout back is Callie's. A walk or steps is not this. */
const EXERCISE_CAL = [
  /\b(exercise|workout) calories\b/,
  /\beat(ing)? (my |the )?(workout|exercise) calories\b/,
  /\bcalories back\b/,
];

/** She mentioned nursing without asking whether supply is in trouble. */
const NURSING_MENTION = /\b(breast ?feed|breastfeeding|nurs(e|es|ed|ing)|pumping|pumped)\b/;

/** Asking about milk output specifically — not just mentioning that she nurses. */
const SUPPLY = [
  /\bmilk (supply|production)\b/, /\bmy supply\b/, /\bdry(ing)? up\b/,
  /\b(breast ?feed|breastfeeding|nursing|pumping)\b[^.?!]{0,30}\b(enough|affect|hurt|drop|boost|increase|impact|safe)\b/,
  /\b(enough|affect|hurt|drop|boost|increase|impact)\b[^.?!]{0,30}\b(milk|supply)\b/,
];

/**
 * Words that mean she is asking about food. Deliberately not a catch-all —
 * "what should I" used to live here and swallowed every question in the app.
 */
const FOOD_ASK = new RegExp(
  [
    "\\beat(ing)?\\b", "\\bmeals?\\b", "\\blunch\\b", "\\bdinner\\b", "\\bbreakfast\\b",
    "\\bbrunch\\b", "\\bsnacks?\\b", "\\bfood\\b", "\\brecipes?\\b", "\\border(ing)?\\b",
    "\\bmenu\\b", "\\brestaurants?\\b", "\\bhungry\\b", "\\bcook(ing)?\\b", "\\bfridge\\b",
    "\\bpantry\\b", "\\bcraving\\b", "\\bmacros?\\b", "\\bfits?\\b", "\\bleft\\b",
    "\\bprotein\\b", "\\bcarbs?\\b", "\\bcalories\\b", "\\btakeout\\b", "\\btake[- ]out\\b",
    "\\bgrocer", "\\bdelivery\\b", "\\bdoordash\\b", "\\buber eats\\b", "\\bgrubhub\\b",
    "\\bhave for\\b", "\\bportions?\\b", "\\bserving\\b", "\\bplate\\b", "\\bdish\\b",
    "\\bleftovers?\\b", "\\bchicken\\b", "\\bturkey\\b", "\\bsalmon\\b", "\\beggs?\\b",
    "\\byogurt\\b", "\\bpasta\\b", "\\brice\\b",
  ].join("|"),
  "i",
);

/**
 * Plainly not food. Narrow on purpose: this list refuses outright, so anything
 * arguable belongs in `unclear` where the model gets to look at it.
 */
const OFF_TOPIC = [
  // Being asked to be a general assistant
  /\b(write|draft|compose) (me )?(a|an|my)\b/, /\bhelp me write\b/, /\bsummari[sz]e\b/,
  /\btranslate\b/, /\bwrite some code\b/, /\bdebug\b/,
  // General knowledge and small talk
  /\bwho (won|is|was)\b/, /\bwhat('?s| is) the (capital|weather|score|time in)\b/,
  /\btell me a (joke|story)\b/, /\bpoem\b/, /\bname for (a|my)\b/,
  // Fitness
  /\b(workout|exercise|gym|cardio|lifting|weights|treadmill|yoga|pilates|peloton)\b/,
  /\b(steps|running|jogging) (goal|target|per day)\b/,
  // Sleep trouble and baby-care gear — not ordinary time-of-day or routine.
  /\bcan'?t sleep\b/, /\bsleep through the night\b/, /\bsleep training\b/, /\binsomnia\b/,
  /\b(daycare|teething|diapers?|stroller|car seat|nursery)\b/,
  // Screens and downtime
  /\b(tv|netflix|movie|watch|podcast|playlist)\b/,
  // Other people
  /\bmy (husband|partner|boss|coworker|mother in law|in ?laws)\b/,
  // Appearance
  /\b(skincare|hair loss|stretch marks|botox)\b/,
];

function hits(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * Decide what the coach is allowed to do with an ask, before any model sees it.
 *
 * @returns {{scope: string, aside: string|null}}
 *   scope "food" means answer it. Anything else means hand it to Callie.
 *   `aside` is set when the ask is a real meal question that also touched
 *   something the coach shouldn't speak to — she gets her cards and one
 *   honest line, rather than a dead end.
 */
export function classifyAsk(raw) {
  const text = String(raw || "").toLowerCase().trim();
  if (!text) return { scope: "food", aside: null };

  // Never answered, never softened into an aside.
  if (hits(URGENT, text)) return { scope: "urgent", aside: null };

  // Guilt with no next-meal question is still hers. Guilt plus "what do I
  // eat next" gets the food, then the handoff.
  const guilt = hits(GUILT, text);
  const nextMeal = NEXT_MEAL.test(text);
  if (guilt && !nextMeal) return { scope: "urgent", aside: null };

  const foodAsk = FOOD_ASK.test(text);

  // Supply is always Callie's. Cards plus a footnote was too cute — she
  // said protect it first, and if a mama thinks it's being affected, write
  // her directly. Mentioning that she nurses, without asking about output,
  // is still a food question, and the answer begins with the supply line.
  if (hits(SUPPLY, text)) return { scope: "supply", aside: null };
  if (hits(RANGES, text)) return { scope: "ranges", aside: null };
  if (hits(WEIGHT, text)) return { scope: "weight", aside: null };
  if (hits(ADMIN, text)) return { scope: "admin", aside: null };
  if (hits(EXERCISE_CAL, text)) return { scope: "off_topic", aside: null };
  if (foodAsk || (guilt && nextMeal)) return foodWithAside(text, guilt, nextMeal);
  if (hits(OFF_TOPIC, text)) return { scope: "off_topic", aside: null };

  // No refusal matched and no food word either. The model looks at it.
  return { scope: "unclear", aside: null };
}

function foodWithAside(text, guilt, nextMeal) {
  const nursing = NURSING_MENTION.test(text) && !hits(SUPPLY, text);
  const care = guilt && nextMeal;
  if (care && nursing) return { scope: "food", aside: "both" };
  if (care) return { scope: "food", aside: "care" };
  if (nursing) return { scope: "food", aside: "nursing" };
  return { scope: "food", aside: null };
}

/** True when the ask is Callie's and the coach must not put it to a model. */
export function scopeIsRefused(scope) {
  return scope !== "food" && scope !== "unclear";
}

const PLATE_ASK = /\b(eat|eating|meal|lunch|dinner|breakfast|snack|hungry|cook|fridge|menu|order|recipe|plate|dish|chicken|eggs?|salmon|yogurt|leftover|ideas|pizza|italian|chinese|sushi|taco|burger)\b/i;
const MEAL_TEACH_HINT = new Set([
  "italian", "chinese", "sushi", "pizzaMeal", "inNOut", "psMethod",
  "neverSkip", "realFood", "underDay", "fasting", "menuLink", "menuClosed", "menuMiss",
]);

/**
 * She is asking for a plate she can make or order. Range-only talk
 * ("raise my calories") is not this, even though it says calories.
 */
export function isMealAsk(raw, { mode = "ask", topic = null } = {}) {
  if (mode === "menu" || mode === "kitchen") return true;
  if (topic && MEAL_TEACH_HINT.has(topic)) return true;
  const text = String(raw || "").toLowerCase().trim();
  if (!text) return false;
  if (NEXT_MEAL.test(text)) return true;
  if (!PLATE_ASK.test(text) && !FOOD_ASK.test(text)) return false;
  if (hits(RANGES, text) && !NEXT_MEAL.test(text) && !/\bwhat (should|can|do) i (eat|have|make|order|get)\b/.test(text)) {
    return false;
  }
  return PLATE_ASK.test(text) || FOOD_ASK.test(text);
}

/** Symptoms, medication, and restriction. Guilt alone is a care handoff, not this. */
export function isClinicalUrgent(raw) {
  const text = String(raw || "").toLowerCase().trim();
  return Boolean(text) && hits(URGENT, text);
}

/** Crisis and postpartum warning signs. These get the emergency line. */
export function isCrisisUrgent(raw) {
  const text = String(raw || "").toLowerCase().trim();
  return Boolean(text) && hits(CRISIS, text);
}

/** Which of Callie's handoff lines a refused scope gets. */
const DEFLECT_FOR_SCOPE = {
  urgent: "medical",
  ranges: "ranges",
  weight: "weight",
  admin: "admin",
  off_topic: "offTopic",
  supply: "supply",
};

export function deflectForScope(scope, asked = "") {
  if (scope === "urgent") {
    if (isCrisisUrgent(asked)) return "emergency";
    return isClinicalUrgent(asked) ? "medical" : "care";
  }
  return DEFLECT_FOR_SCOPE[scope] || "offTopic";
}

/**
 * The model handed a question back. Re-check the original ask so a
 * missed crisis is never answered with the off-topic line.
 */
export function deflectModelHandoff(text) {
  if (isCrisisUrgent(text) || isClinicalUrgent(text) || classifyAsk(text).scope === "urgent") {
    return deflectForScope("urgent", text);
  }
  return "offTopic";
}

/**
 * Macros a model returned have to survive arithmetic before she sees them.
 * 4/4/9 is not exact for real food, but a hallucinated number misses it by
 * a mile, and the tolerance is wide enough that a real dish never trips it.
 */
export function macrosPlausible(meal) {
  const cal = Number(meal?.cal) || 0;
  const p = Number(meal?.p) || 0;
  const c = Number(meal?.c) || 0;
  const f = Number(meal?.f) || 0;
  if (cal <= 0 || cal > 2500) return false;
  if (p < 0 || c < 0 || f < 0) return false;
  if (p > 200 || c > 400 || f > 200) return false;
  const derived = 4 * p + 4 * c + 9 * f;
  if (derived <= 0) return false;
  const slack = Math.max(120, cal * 0.25);
  return Math.abs(derived - cal) <= slack;
}

/** The model may describe food. It may not restate her numbers or her health. */
const REPLY_BANNED = [
  /\byour (range|ranges|macros|target|targets) (are|is|should be)\b/i,
  /\bi('| a)?m not a (doctor|dietitian|nutritionist)\b/i,
  /\bconsult (your|a) (doctor|physician|provider)\b/i,
  /\bas an ai\b/i,
  /\bcheat (meal|day)\b/i,
];

/** Internal jargon. cleanReply drops the whole reply and keeps the cards. */
const REPLY_JARGON = [
  /\b(from|in) (the|callie'?s) bank\b/gi,
  /\bprotein floor\b/gi,
  /\b(its|her|your) band\b/gi,
  /\bslot\b/gi,
];

function tidyScrubbed(text) {
  return String(text || "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^\s*[,.;:]\s*/, "")
    .trim();
}

export function scrubCoachReply(text) {
  let out = String(text || "");
  for (const re of REPLY_JARGON) {
    out = out.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`), "");
  }
  return tidyScrubbed(out);
}

export function replyHasJargon(text) {
  const s = String(text || "");
  return REPLY_JARGON.some((re) => {
    re.lastIndex = 0;
    return re.test(s);
  });
}

export function replyIsClean(text) {
  const s = String(text || "");
  return !REPLY_BANNED.some((re) => re.test(s));
}
