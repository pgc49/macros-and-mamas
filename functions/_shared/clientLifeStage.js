/**
 * Life-stage facts for client-facing meal AI.
 *
 * Macros and Mamas is a postpartum program, but paying clients include
 * women who are not postpartum (moms of teens, not-recently-pregnant).
 * Comments like "excellent postpartum meal" must come from her profile,
 * never from the program name.
 */

export function monthsPpNumber(profile) {
  const raw = profile?.monthsPP ?? profile?.months_pp;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** True only when the profile itself lists postpartum or nursing. */
export function hasPostpartumSeason(profile) {
  if (!profile || typeof profile !== "object") return false;
  if (profile.breastfeeding === true) return true;
  return monthsPpNumber(profile) != null;
}

export function lifeStageCommentRules(profile = {}) {
  const pp = hasPostpartumSeason(profile);
  const bf = profile.breastfeeding === true;
  if (pp && bf) {
    return "Personal comments may mention postpartum or nursing only when it is relevant to this food and matches the facts above. Still keep the note about the plate, not a slogan.";
  }
  if (pp) {
    return "She is postpartum. You may mention that season only if it is relevant to the food. Do not mention breastfeeding, nursing, or milk supply — her profile does not list them.";
  }
  return "Do not call this a postpartum meal, a new-mom meal, or mention recovery from birth, milk supply, or nursing. Ground any personal comment in the food and the facts above — never in a generic Macros and Mamas / postpartum script.";
}

export function buildClientLifeStageBlock(profile = {}) {
  const name = String(profile.name || "").trim() || "this client";
  const months = monthsPpNumber(profile);
  const bf = profile.breastfeeding;
  const pregnant = profile.pregnant;
  const goal = String(profile.goal || "").trim();
  const ageRaw = profile.age;
  const age = ageRaw != null && ageRaw !== "" ? Number(ageRaw) : null;

  const lines = [
    "## Her season (facts from her profile — never invent)",
    `- Name: ${name}`,
  ];
  if (Number.isFinite(age) && age > 0) lines.push(`- Age: ${age}`);

  if (pregnant === true) {
    lines.push("- Pregnant: yes — do not frame the meal as postpartum");
  } else if (pregnant === false) {
    lines.push("- Pregnant: no");
  } else {
    lines.push("- Pregnant: not listed");
  }

  if (months != null) {
    lines.push(`- Postpartum: yes (${months} months)`);
  } else if (bf === true) {
    lines.push("- Postpartum: yes (breastfeeding — months not listed)");
  } else {
    lines.push("- Postpartum: not listed — do NOT assume she is postpartum, a new mom, or recovering from birth");
  }

  if (bf === true) {
    lines.push("- Breastfeeding: yes");
  } else if (bf === false) {
    lines.push("- Breastfeeding: no — do not mention milk supply, nursing, or breastfeeding");
  } else {
    lines.push("- Breastfeeding: not listed — do not mention milk supply or nursing");
  }

  if (goal === "lose") lines.push("- Goal: lose fat");
  else if (goal === "gain") lines.push("- Goal: build strength");
  else if (goal === "maintain") lines.push("- Goal: maintain");
  else if (goal) lines.push(`- Goal: ${goal}`);

  lines.push("");
  lines.push(lifeStageCommentRules(profile));
  return lines.join("\n");
}

const PP_CLAIM = /\bpost[\s-]?partum(?:-friendly|[\s-]+recovery)?\b/gi;
const NEW_MAMA = /\bnew[\s-]*(?:mama|mom|mother)\b/gi;
const BIRTH_RECOVERY = /\b(?:fourth\s+trimester|after\s+(?:the\s+)?baby|after\s+giving\s+birth|newborn|baby\s+weight)\b/gi;
const BF_CLAIM = /\b(?:breast[\s-]?feed(?:ing|s)?|nursing|milk\s+supply|lactat(?:e|ion|ing))\b/gi;
const PREG_CLAIM = /\bpregnan(?:t|cy)\b/gi;

function collapseComment(text) {
  return String(text || "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?]){2,}/g, "$1")
    .replace(/\s*[-—]+\s*[-—]+\s*/g, " — ")
    .replace(/^\s*[-—,:;]+\s*/, "")
    .replace(/\s*[-—,:;]+\s*$/, "")
    .replace(/\b(?:supports?|helps?|aids?|boosts?|for|as|like|about)\s*[.!?]?$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripClaims(text, pattern) {
  return collapseComment(String(text || "").replace(pattern, " "));
}

/**
 * Drop life-stage claims the profile does not support.
 * Safer default: if we do not have a profile, do not keep postpartum talk.
 */
export function groundClientFacingComment(raw, profile = null) {
  let text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const pp = hasPostpartumSeason(profile);
  const bf = profile?.breastfeeding === true;
  const pregnant = profile?.pregnant === true;

  if (!pp) {
    text = stripClaims(text, PP_CLAIM);
    text = stripClaims(text, NEW_MAMA);
    text = stripClaims(text, BIRTH_RECOVERY);
  }
  if (!bf) text = stripClaims(text, BF_CLAIM);
  if (!pregnant) text = stripClaims(text, PREG_CLAIM);

  if (text && /^[a-z]/.test(text)) {
    text = text[0].toUpperCase() + text.slice(1);
  }
  return text;
}

export function profileFromRow(row) {
  if (!row || typeof row !== "object") return {};
  return {
    name: row.name || "",
    age: row.age,
    monthsPP: row.months_pp ?? row.monthsPP ?? null,
    breastfeeding: row.breastfeeding ?? null,
    pregnant: row.pregnant ?? null,
    goal: row.goal || "",
  };
}
