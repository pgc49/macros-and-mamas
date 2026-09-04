/**
 * The asks the coach can answer without a model.
 *
 * "What should I eat?" is the question she asks most, and every part of its
 * answer — her ranges, what's logged, what's pencilled, what she likes — is
 * already on her device. Routing those asks locally keeps them instant, keeps
 * her limited model calls for the questions that actually need one, and means
 * a typed question and a tapped chip give her the same answer.
 *
 * This is deliberately strict: a pattern has to account for the whole message.
 * Anything carrying detail of its own ("what should I eat, I've only got
 * chicken") falls through to the model rather than being answered from a guess
 * at what she meant.
 */

import { normalizeSlot } from "./mealSlots.js";

const SLOT_WORDS = [
  [/\b(breakfast|morning)\b/, "breakfast"],
  [/\b(lunch|midday)\b/, "lunch"],
  [/\b(dinner|supper|tonight|evening)\b/, "dinner"],
  // "snack on" is one phrase; leaving "on" behind made "what should I snack
  // on" unrecognisable and sent the one question the bank answers best to the
  // model.
  [/\b(snacks?)( on)?\b/, "snack"],
];

/** Words that never change which answer she wants. */
const STOPWORDS = /\b(for|the|a|an|of|today|right now|now|please|pls|hey|hi|ok|okay|coach|some|any|good|idea|ideas|option|options|suggestion|suggestions)\b/g;

/**
 * What's left once the slot word has been lifted out — "dinner?" on its own,
 * or "what should I ___ for dinner". Only consulted when a slot was named, so
 * these can be looser than the patterns that stand alone.
 */
const STUB = new RegExp([
  "^(",
  "what|whats|what is|ideas|eat|food|meal|meals",
  "|what (should|can|could|do|will) i( do| have| eat| make| get)?",
  "|im hungry for|i want|i need|how about|what about",
  ")$",
].join(""));

const CARD_ASKS = [
  /^what (should|can|could|do|will) i (eat|have|make|cook|order|get)$/,
  /^what (should|can|could) i be (eating|having)$/,
  /^(give|show|tell) me( what)?( i)?( should)?( eat)?$/,
  /^(im|i am) hungry$/,
  /^(i dont|dont) know what (to eat|i want)$/,
  /^what to eat$/,
  /^(help me decide|help me|help|feed me|what now|im stuck|i am stuck)$/,
  /^what else can i eat$/,
];

const READ_ASKS = [
  /^how(s| is| am) my day( looking| going)?$/,
  /^how am i doing( today)?$/,
  /^(what|how much) (do i have|have i got|s|is) left$/,
  /^how much protein do i (need|have left)$/,
  /^(where am i|am i on track|whats left)$/,
  /^(my )?(numbers|totals|macros|ranges)$/,
];

const LIGHTER = /^(something )?(lighter|light|smaller|less)$/;
const MORE_PROTEIN = /^(more|higher|extra) protein$/;
const OTHERS = /^(something else|anything else|other|others|none|none these|none those|different|another)$/;

function normalize(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[’‘`']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What she typed, if the coach already knows the answer.
 *
 * Returns `null` when the message needs the model, which is the default for
 * anything not recognised outright.
 */
export function localCoachIntent(raw) {
  const text = normalize(raw);
  if (!text || text.length > 60) return null;

  let slot = null;
  let stripped = text;
  for (const [pattern, name] of SLOT_WORDS) {
    if (!pattern.test(stripped)) continue;
    slot = normalizeSlot(name);
    stripped = stripped.replace(pattern, " ");
    break;
  }

  const core = stripped.replace(STOPWORDS, " ").replace(/\s+/g, " ").trim();

  // "Dinner?" on its own, or a question the slot word carried entirely.
  if (slot && (!core || STUB.test(core))) return { kind: "cards", slot, prefer: null };
  if (!core) return null;

  if (LIGHTER.test(core)) return { kind: "cards", slot, prefer: "lighter" };
  if (MORE_PROTEIN.test(core)) return { kind: "cards", slot, prefer: "protein" };
  if (OTHERS.test(core)) return { kind: "more", slot, prefer: null };
  if (CARD_ASKS.some((p) => p.test(core))) return { kind: "cards", slot, prefer: null };
  if (READ_ASKS.some((p) => p.test(core))) return { kind: "read", slot, prefer: null };
  return null;
}
