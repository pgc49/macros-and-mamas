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
 * supply   — breastfeeding output. Cards are still fine; the supply part isn't.
 */
export const COACH_SCOPES = ["food", "urgent", "ranges", "weight", "admin", "off_topic"];

const URGENT = [
  // Symptoms
  /\bdizz(y|iness)\b/, /\bfaint(ing)?\b/, /\blight[- ]?headed\b/, /\bchest pain\b/,
  /\bpalpitation/, /\bshort(ness)? of breath\b/, /\bbleed(ing)?\b/, /\bh(a)?emorrhag/,
  /\bfever\b/, /\bmigraine/, /\bblurred vision\b/, /\bnumbness\b/, /\brash\b/,
  /\bvomit/, /\bdiarrh/, /\bconstipat/, /\bcontractions\b/, /\bpreeclamp/,
  /\bpassing out\b/, /\bblack(ing)? out\b/,
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
  // Mental health
  /\banxiety\b/, /\banxious\b/, /\bdepress/, /\bppd\b/, /\bpanic attack/,
  /\btherapist\b/, /\bsuicid/, /\bself[- ]harm/,
  // Restriction and disordered eating
  /\bbinge/, /\bpurge/, /\bpurging\b/, /\bstarv/, /\banorexi/, /\bbulimi/,
  /\bnot eating\b/, /\bstop eating\b/, /\bskip(ping)? meals\b/, /\bfast(ing)? all day\b/,
  /\bhate my body\b/, /\bdisgusting\b/, /\bfeel guilty\b/, /\bpunish/,
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
  /\bpayment\b/, /\binvoice\b/, /\bmy plan\b/, /\bcohort\b/, /\bpassword\b/,
  /\blog ?in\b/, /\bsign ?in\b/, /\bapprove/, /\bapproval\b/,
  /\bweek \d+\b[^.?!]{0,20}\bstart/, /\bwhen does\b[^.?!]{0,25}\b(program|course|cohort)\b/,
  /\bcallie hasn'?t\b/, /\bhear back from callie\b/,
];

/** Asking about milk output specifically — not just mentioning that she nurses. */
const SUPPLY = [
  /\bmilk (supply|production)\b/, /\bmy supply\b/, /\bdry(ing)? up\b/,
  /\b(breast ?feed|breastfeeding|nursing|pumping)\b[^.?!]{0,30}\b(enough|affect|hurt|drop|boost|increase|impact|safe)\b/,
  /\b(enough|affect|hurt|drop|boost|increase|impact)\b[^.?!]{0,30}\b(milk|supply)\b/,
];

/** Words that mean she is asking about food, not about herself. */
const FOOD_ASK = new RegExp(
  [
    "\\beat(ing)?\\b", "\\bmeals?\\b", "\\blunch\\b", "\\bdinner\\b", "\\bbreakfast\\b",
    "\\bsnacks?\\b", "\\bfood\\b", "\\brecipes?\\b", "\\border(ing)?\\b", "\\bmenu\\b",
    "\\brestaurants?\\b", "\\bhungry\\b", "\\bcook(ing)?\\b", "\\bfridge\\b", "\\bpantry\\b",
    "\\bcraving\\b", "\\bmacros?\\b", "\\bfits?\\b", "\\bleft\\b", "\\bprotein\\b",
    "\\bcarbs?\\b", "\\bcalories\\b", "\\btakeout\\b", "\\btake[- ]out\\b", "\\bgrocer",
    "\\bmake\\b", "\\bhave for\\b", "\\bwhat should i\\b",
  ].join("|"),
  "i",
);

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

  const foodAsk = FOOD_ASK.test(text);

  if (hits(SUPPLY, text)) {
    return foodAsk ? { scope: "food", aside: "supply" } : { scope: "urgent", aside: null };
  }
  if (hits(RANGES, text)) return { scope: "ranges", aside: null };
  if (hits(WEIGHT, text)) return { scope: "weight", aside: null };
  if (hits(ADMIN, text)) return { scope: "admin", aside: null };
  if (!foodAsk) return { scope: "off_topic", aside: null };

  return { scope: "food", aside: null };
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

export function replyIsClean(text) {
  const s = String(text || "");
  return !REPLY_BANNED.some((re) => re.test(s));
}
