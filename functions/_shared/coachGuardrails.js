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
export const COACH_SCOPES = ["food", "unclear", "urgent", "ranges", "weight", "admin", "off_topic", "supply", "disordered", "medication", "mood"];

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
  /\b(c-?section )?scar\b.{0,28}\booz/,
  /\boozing\b.{0,28}\b(c-?section )?scar/,
  /\buti\b/,
  /\burinary tract\b/,
  /\b(haven'?t|have not|not) (been )?eat(en|ing)? all day\b/,
  /\b(didn'?t|did not) eat all day\b/,
  /\b(haven'?t|have not|didn'?t|did not|not)\b.{0,32}\beat(en|ing)?\b.{0,24}\ball day\b/,
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
  /\bnot eating\b(?![^.?!]{0,24}\b(enough|protein|carbs?|fats?|fibre|fiber|veg|vegetables|breakfast|lunch|dinner|meat|dairy|gluten)\b)/,
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
/** Purge, restriction-to-lose, making herself throw up. Not ordinary nausea. */
const DISORDERED = [
  /\bmak(e|ing) myself throw up\b/,
  /\bthrow(s|ing)? up after (meals?|eating|i eat)\b/,
  /\bonly eat(ing)? once a day\b/,
  /\beat(ing)? only once a day\b/,
  /\beat once a day\b/,
  /\b(only |just )?(1|2|one|two) meals? a day\b/,
  /\beat(ing)? (only )?(1|2|one|two) meals?( a day)?\b/,
  /\bskip meals\b/,
  /\bfast(?:ing)?(?:\s+\d+\s*hours?)?.{0,24}\b(nurs(?:e|ing|ed)?|breastfeed(?:ing|s)?)\b/,
  /\beat once a day\b.{0,24}\blose (faster|weight)\b/,
  /\bpurge\b/, /\bpurging\b/,
];

/** Restriction-to-lose: any calorie number under 1500 framed as ok / a day / under. */
export function isVeryLowCalorieAsk(raw) {
  const text = String(raw || "").toLowerCase();
  if (!text) return false;
  const hits = [...text.matchAll(/\b(?:under|less than|only|just|eat(?:ing)?|is|are|should)?[^.]{0,24}?(\d{3,4})\s*(?:cal|cals|calories)\b/g)];
  return hits.some((hit) => {
    const n = Number(hit[1]);
    if (!(n > 0 && n < 1500)) return false;
    return /\b(ok|okay|fine|enough|a day|under|less than|only|is it)\b/.test(text);
  });
}

/** A one-off "skip dinner tonight" is fuel, not the disordered door. */
export function isSkipTonightAsk(raw) {
  const text = String(raw || "").toLowerCase();
  if (!text) return false;
  if (/\bskip meals\b/.test(text) || /\bmeals? a day\b/.test(text)) return false;
  return /\b(just don'?t eat|don'?t eat)\b.{0,24}\b(dinner|lunch|breakfast|tonight)\b/.test(text)
    || /\bskip\b.{0,20}\b(dinner|lunch|breakfast|this meal)\b.{0,12}\btonight\b/.test(text)
    || /\bskip\b.{0,12}\btonight\b/.test(text);
}

/** A named OTC or "should I take this pill" — not a food ask. */
const MEDICATION = [
  /\b(ibuprofen|advil|motrin|tylenol|acetaminophen|aspirin|aleve|naproxen|benadryl)\b/,
  /\bshould i take\b.{0,28}\b(a |an )?(pill|tablet|dose|ibuprofen|advil|tylenol|aspirin)\b/,
];

const GUILT = [
  /\bfeel guilty\b/,
  /\bfeel(ing)? (awful|bad|terrible|so bad) about\b/,
  /\bguilty (about|for)\b/,
  /\bblew it\b/,
  /\b(half )?a sleeve of cookies\b/,
  /\bate half a sleeve\b/,
  /\bnot hungry but i should eat\b/,
  /\bdon'?t want to log\b/,
  /\bcan'?t send me a new (breakfast|lunch|dinner|meal)\b/,
  /\byou can'?t send me\b/,
  /\bskipped (lunch|breakfast|dinner|a meal)\b/,
  /\bi (messed up|screwed up|ruined it)\b/,
  /\bshouldn'?t have (eaten|had)\b/,
];

const NEXT_MEAL = /\b(what should i eat|what (do|can|should) i (eat|have|get|order)|what to eat next|eat next|for (breakfast|lunch|dinner)|what'?s for (breakfast|lunch|dinner))\b/;

/** Shame or a skipped meal — still a food question. Not Callie's unless she is restricting. */
export function isGuiltAsk(raw) {
  return hits(GUILT, String(raw || "").toLowerCase().trim());
}

/** Eating the workout back is Callie's. A walk or steps is not this. */
const EXERCISE_CAL = [
  /\b(exercise|workout) calories\b/,
  /\beat(ing)? (my |the )?(workout|exercise) calories\b/,
  /\bcalories back\b/,
];

/** She mentioned nursing without asking whether supply is in trouble. */
/** Asking about milk output specifically — not just mentioning that she nurses. */
const SUPPLY = [
  /\bmilk (supply|production)\b/, /\bmy supply\b/, /\bdry(ing)? up\b/,
  /\b(breast ?feed|breastfeeding|nursing|pumping)\b[^.?!]{0,30}\b(enough|affect|hurt|drop|boost|increase|impact|safe)\b/,
  /\b(enough|affect|hurt|drop|boost|increase|impact)\b[^.?!]{0,30}\b(milk|supply)\b/,
  /\bpumping less than usual\b/,
  /\bpumped? (way )?less\b/,
  /\bpumping less\b/,
  /\boutput dropped\b/,
  /\bsupply tanked\b/,
  /\blos(ing|t) my milk\b/,
  /\bsupply went down\b/,
  /\bfor supply\b/,
  /\bok for supply\b/,
];

/** Broth/pho/noodle questions about an active dish are food, not the supply door. */
function isDishSupplyAsk(text) {
  return /\b(pho|broth|noodles?)\b/.test(text)
    && /\b(supply|nursing|breastfeed)/.test(text);
}

/**
 * Words that mean she is asking about food. Deliberately not a catch-all —
 * "what should I" used to live here and swallowed every question in the app.
 */
const FOOD_ASK = new RegExp(
  [
    "\\beat(ing)?\\b", "\\bmeals?\\b", "\\blunch(es)?\\b", "\\bdinners?\\b", "\\bbreakfasts?\\b",
    "\\bbrunch\\b", "\\bsnacks?\\b", "\\bfood\\b", "\\brecipes?\\b", "\\border(ing)?\\b",
    "\\bmenu\\b", "\\brestaurants?\\b", "\\bhungry\\b", "\\bcook(ing)?\\b", "\\bfridge\\b",
    "\\bpantry\\b", "\\bcraving\\b", "\\bmacros?\\b", "\\bfits?\\b", "\\bleft\\b",
    "\\bprotein\\b", "\\bcarbs?\\b", "\\bcalories\\b", "\\btakeout\\b", "\\btake[- ]out\\b",
    "\\bgrocer", "\\bdelivery\\b", "\\bdoordash\\b", "\\buber eats\\b", "\\bgrubhub\\b",
    "\\bhave for\\b", "\\bportions?\\b", "\\bserving\\b", "\\bplate\\b", "\\bdish\\b",
    "\\bleftovers?\\b", "\\bchicken\\b", "\\bturkey\\b", "\\bsalmon\\b", "\\beggs?\\b",
    "\\byogurt\\b", "\\bpasta\\b", "\\brice\\b", "\\beaten\\b", "\\bate\\b", "\\bstarv(ing|ed)?\\b",
    "\\bsmoothie\\b", "\\bpizza\\b", "\\bcookies?\\b", "\\bcottage cheese\\b", "\\bvegetarian\\b",
    "\\btortillas?\\b", "\\btacos?\\b", "\\bsandwich(?:es)?\\b", "\\balmonds?\\b",
    "\\bmcdonalds\\b",
    "\\bpho\\b", "\\bbroth\\b", "\\bnoodles?\\b", "\\bwraps?\\b", "\\bbeef\\b",
  ].join("|"),
  "i",
);

/**
 * Meal asks that do not use a food word: something new, surprise me, a swap.
 * classifyAsk treats these as food so they never trip a guardrail.
 */
const MEAL_INTENT = [
  /\bsomething new\b/,
  /\bsurprise me\b/,
  /\bbored of (everything|these|what)\b/,
  /\bnot the smoothie\b/,
  /\bi hate cottage cheese\b/,
  /\bmake it vegetarian\b/,
  /\bless prep\b/,
  /\bdon'?t have spinach\b/,
  /\bswap\b/,
  /\bask callie\b/,
  /\bin \d+ minutes?\b/,
  /\bbaby is screaming\b/,
  /\bhaven'?t eaten\b/,
  /\bwhat'?s good at\b/,
  /\bgood option\b/,
  /\bwhat (can|should|could|do) i make\b/,
  /\bthis is what i have\b/,
  /\bwhat i have\b/,
  /\bany suggestions?\b/,
  /\bwhat do you suggest\b/,
  /\banother one\b/,
  /\bdessert\??\b/,
  /\bgive me (a few )?options\b/,
  /\bwhat'?s quick\b/,
  /\bsomething (sweet|filling|warm|salty|crunchy|else)\b/,
  /\bwhat now\b/,
  /\bwhat'?s next\b/,
  /\bwhat would you pick\b/,
  /\b(you )?pick for me\b/,
  /\bnothing sounds good\b/,
  /\bi need (something|fuel)\b/,
  /\brunning on empty\b/,
  /\bwhat'?s easy\b/,
  /\bquick bite\b/,
  /\bgrab and go\b/,
  /\bon the go\b/,
  /\bwhat can i grab\b/,
  /\bi want a treat\b/,
];

const SHORT_FOOD = /^(any suggestions?|suggestions\??|what do you suggest|another( one)?|dessert\??|more|next|what now|what'?s next|options\??|give me (a few )?options|what'?s quick|something (sweet|filling|warm|salty|crunchy|else)|what would you pick|you pick|pick for me|nothing sounds good|i need (something|fuel)|running on empty|low effort tonight|lazy night|what'?s easy|easy please|quick bite|grab and go|on the go|treat\??|can i have dessert|i want a treat|after my walk\??|before bed\??|family friendly\??|not that one|what can i grab)$/i;

export function isShortFoodAsk(raw) {
  const text = String(raw || "").toLowerCase().trim().replace(/[.!]+$/, "");
  if (!text || text.length > 80) return false;
  return SHORT_FOOD.test(text) || hits(MEAL_INTENT, text);
}

/** Postpartum mood — Callie's, not crisis. Food in the same ask still gets plates. */
const MOOD = [
  /\bcry(ing)? (every day|a lot|all (day|week|the time))\b/,
  /\bkeep crying\b/,
  /\bcan'?t stop crying\b/,
  /\bi'?ve been crying\b/,
  /\bive been crying\b/,
  /\bcry(ing)? and i don'?t know why\b/,
  /\bcry(ing)?\b.{0,48}\bdon'?t (really )?know why\b/,
  /\bfeel(ing)? (really )?(down|low|hopeless)( lately)?\b/,
  /\bnot myself\b/,
  /\banxious all the time\b/,
  /\banxiety all the time\b/,
  /\bnot bonding\b/,
  /\bis it normal to feel this way\b/,
];

export function isMoodAsk(raw) {
  return hits(MOOD, String(raw || "").toLowerCase().trim());
}

/** Last two mama asks: stay in mood/crisis when the next line is not food. */
export function recentCarefulDoor(priorAsks = []) {
  const recent = (Array.isArray(priorAsks) ? priorAsks : []).slice(-2);
  let door = null;
  for (const ask of recent) {
    if (isCrisisUrgent(ask)) door = "urgent";
    else if (isMoodAsk(ask) && door !== "urgent") door = "mood";
  }
  return door;
}

export function recentCrisisAsks(priorAsks = []) {
  return (Array.isArray(priorAsks) ? priorAsks : []).slice(-2).some((ask) => isCrisisUrgent(ask));
}

const CRISIS_DISMISS = /^(ok|okay|k|fine|i'?m fine( now)?|never mind|nvm|i'?m ok|i am fine( now)?)([.!]?)$/i;

export function isCrisisDismiss(raw) {
  const text = String(raw || "").toLowerCase().trim();
  if (!text) return false;
  return CRISIS_DISMISS.test(text)
    || /\bi'?m fine now\b/.test(text)
    || /\bnever mind\b/.test(text);
}

export function isExplicitMealAsk(raw) {
  const text = String(raw || "").toLowerCase().trim();
  if (!text || isCrisisDismiss(text)) return false;
  return (FOOD_ASK.test(text) || hits(MEAL_INTENT, text)) && !CRISIS_DISMISS.test(text);
}

const IN_THREAD_FOLLOW = [
  /^(yes|yeah|yep|sure|please|yes please|ok please)\.?$/i,
  /\bi don'?t like (those|these|that|them)\b/,
  /\bthe (first|second|third|last) one\b/,
  /\bhow do i make (it|that|this)\b/,
  /\bi only have \d+ minutes?\b/,
  /\bin \d+ minutes?\b/,
  /\bsounds good\b/,
];

export function isInThreadFollowUp(raw, priorAsks = []) {
  if (!priorAsks?.length || recentCrisisAsks(priorAsks)) return false;
  const text = String(raw || "").toLowerCase().trim();
  if (!text) return false;
  return IN_THREAD_FOLLOW.some((re) => re.test(text));
}

/** Feelings with no food in them that are not the mood door. */
const EMOTIONAL = [
  /\b(get|getting) (my |the )?baby to sleep\b/,
  /\bbaby sleep\b/,
  /\bso lonely\b/,
  /\bi'?m lonely\b/,
  /\bcolic\b/,
  /\bmy back is killing me\b/,
  /\bback (is |keeps )?killing me\b/,
];

export function isEmotionalAsk(raw) {
  const text = String(raw || "").toLowerCase().trim();
  if (!text) return false;
  if (FOOD_ASK.test(text) || hits(MEAL_INTENT, text) || isGuiltAsk(text)) return false;
  return hits(EMOTIONAL, text) || (isMoodAsk(text) && !FOOD_ASK.test(text) && !hits(MEAL_INTENT, text));
}

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
  /\b(get|getting) (my |the )?baby to sleep\b/, /\bbaby sleep\b/,
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
export function classifyAsk(raw, { mode = "ask", priorAsks = [] } = {}) {
  const text = String(raw || "").toLowerCase().trim();
  if (!text) return { scope: "food", aside: null };

  // Crisis before every other door. A purge or ibuprofen line that also
  // says she wants to die is 911/988, not the disordered or pharmacist line.
  if (isCrisisUrgent(text)) return { scope: "urgent", aside: null };
  if (recentCrisisAsks(priorAsks) && !isExplicitMealAsk(text)) {
    return { scope: "urgent", aside: null, follow: true, crisisFollow: true };
  }
  if (hits(DISORDERED, text) || isVeryLowCalorieAsk(text)) return { scope: "disordered", aside: null };
  if (hits(MEDICATION, text)) return { scope: "medication", aside: null };
  if (hits(MOOD, text)) return { scope: "mood", aside: null };
  if (hits(URGENT, text)) return { scope: "urgent", aside: null };

  // Guilt and low appetite are meal questions. Restriction language
  // already returned disordered above.
  const guilt = hits(GUILT, text);
  const foodAsk = FOOD_ASK.test(text) || hits(MEAL_INTENT, text) || isShortFoodAsk(text);

  // Supply is always Callie's. Cards plus a footnote was too cute — she
  // said protect it first, and if a mama thinks it's being affected, write
  // her directly. Mentioning that she nurses, without asking about output,
  // is still a food question, and the answer begins with the supply line.
  if (hits(SUPPLY, text) && !isDishSupplyAsk(text)) return { scope: "supply", aside: null };
  if (hits(RANGES, text)) return { scope: "ranges", aside: null };
  if (hits(WEIGHT, text)) return { scope: "weight", aside: null };
  if (hits(ADMIN, text)) return { scope: "admin", aside: null };
  if (hits(EXERCISE_CAL, text)) return { scope: "off_topic", aside: null };
  if (foodAsk || guilt || isInThreadFollowUp(text, priorAsks)) return { scope: "food", aside: null };
  const careful = recentCarefulDoor(priorAsks);
  if (careful) return { scope: careful, aside: null, follow: true };
  if (hits(OFF_TOPIC, text) || isEmotionalAsk(text)) return { scope: "off_topic", aside: null };
  // A kitchen or menu photo plus a "what can I make" caption is food,
  // even when the caption itself has no food word.
  if (mode === "kitchen" || mode === "menu" || mode === "photo") return { scope: "food", aside: null };

  // After a food ask, a non-food leftover ("I'm so lonely") is Callie's.
  if (priorAsks.length && !foodAsk && !guilt) return { scope: "off_topic", aside: null };

  // No refusal matched and no food word either. The model looks at it.
  return { scope: "unclear", aside: null };
}

/** True when the ask is Callie's and the coach must not put it to a model. */
export function scopeIsRefused(scope) {
  return scope !== "food" && scope !== "unclear";
}

const PLATE_ASK = /\b(eat|eating|eaten|ate|meal|lunch|dinner|breakfast|snack|hungry|starving|cook|fridge|menu|order|recipe|plate|dish|chicken|eggs?|salmon|yogurt|leftover|ideas|pizza|italian|chinese|sushi|tacos?|burgers?|sandwich(?:es)?|smoothie|vegetarian|swap|surprise me|something new|mcdonalds|almonds?|chipotle|thai|takeout|help me plan|plan tomorrow)\b/i;
const MEAL_TEACH_HINT = new Set([
  "italian", "chinese", "sushi", "sushiNursing", "pizzaMeal", "inNOut", "psMethod",
  "neverSkip", "realFood", "underDay", "fasting", "coffee", "waterEat",
  "alcoholNursing", "menuLink", "menuClosed", "menuMiss",
]);

/**
 * She is asking for a plate she can make or order. Range-only talk
 * ("raise my calories") is not this, even though it says calories.
 */
export function isMealAsk(raw, { mode = "ask", topic = null } = {}) {
  if (mode === "menu" || mode === "kitchen" || mode === "photo") return true;
  if (topic && MEAL_TEACH_HINT.has(topic)) return true;
  const text = String(raw || "").toLowerCase().trim();
  if (!text) return false;
  if (isCrisisUrgent(text)) return false;
  if (isEmotionalAsk(text)) return false;
  const verdict = classifyAsk(text);
  if (verdict.scope === "off_topic" || verdict.scope === "ranges" || verdict.scope === "weight" || verdict.scope === "admin") {
    return false;
  }
  if (isGuiltAsk(text) || isShortFoodAsk(text)) return true;
  if (NEXT_MEAL.test(text)) return true;
  if (hits(MEAL_INTENT, text)) return true;
  if (/\b(something else|anything else|what else)\b/.test(text)) return true;
  if (verdict.scope === "food") return true;
  // Unclear is not automatically food. Only switch when she named food or
  // sent a kitchen/menu photo. Otherwise the model hand-back stays Callie's.
  if (hits(RANGES, text) && !NEXT_MEAL.test(text) && !/\bwhat (should|can|do) i (eat|have|make|order|get)\b/.test(text)) {
    return false;
  }
  return PLATE_ASK.test(text) || FOOD_ASK.test(text);
}

export function isDisorderedAsk(raw) {
  const text = String(raw || "").toLowerCase().trim();
  return hits(DISORDERED, text) || isVeryLowCalorieAsk(text);
}

export function isMedicationAsk(raw) {
  return hits(MEDICATION, String(raw || "").toLowerCase().trim());
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
  disordered: "disordered",
  medication: "medication",
  mood: "mood",
};

export function deflectForScope(scope, asked = "", { follow = false, crisisFollow = false } = {}) {
  if (crisisFollow) return "crisisFollow";
  if (follow && scope === "mood") return "moodFollow";
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
  if (isMoodAsk(text) || classifyAsk(text).scope === "mood") return "mood";
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
