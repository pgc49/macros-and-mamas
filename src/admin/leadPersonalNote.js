/**
 * Deterministic personal note for Callie to copy from admin lead detail.
 * No LLM. No send. Built only from persisted quiz fields we already show.
 * First-person Callie: one quiz observation, one "I too have felt" line, no em dashes.
 */

export const PERSONAL_NOTE_SUBJECT = "Quick note from Callie";
export const PAID_NOTE_COPY = "She's already in. No outreach draft.";
export const INVITE_GUIDE_LINE =
  "I personally will be in your DMs helping guide you through the next 8 weeks. If you have any questions prior to signing up I'm available and checking emails.";
export const INVITE_JOIN_LINE =
  "Registration closes on Thursday and I hope you'll join.";

/** Some mail apps choke past ~2k. Still show Copy when we drop the body. */
export const MAILTO_MAX_LEN = 2000;

const BANNED = [
  "i hope this email finds you well",
  "holistic nutritionist",
  "limited spots remaining",
  "not feeding breast milk",
  "doors close",
];

const EM_DASH = "\u2014";

function leadFlags(lead) {
  return (Array.isArray(lead?.flags) ? lead.flags : [])
    .map((flag) => String(flag || "").trim())
    .filter(Boolean);
}

function hasFlag(lead, name) {
  return leadFlags(lead).includes(name);
}

function segmentOf(lead) {
  return String(lead?.segment || "").trim();
}

function monthsOf(lead) {
  return String(lead?.months_postpartum || "").trim();
}

function feedingOf(lead) {
  return String(lead?.feeding_status || "").trim();
}

export function isPaidLead(lead) {
  return lead?.funnelStatus === "paid"
    || Boolean(lead?.profilePaidAt)
    || Boolean(lead?.paid)
    || Boolean(lead?.paid_at);
}

/** Pregnancy nurture + plant-based waitlist are not this sales cohort. */
export function isSoftPitchLead(lead) {
  const segment = segmentOf(lead);
  return segment === "waitlist_plantbased"
    || segment === "pregnancy_nurture"
    || monthsOf(lead) === "still_pregnant";
}

/** Exclusive, combination, or weaning: still in a breastfeeding season. */
export function isStillBreastfeeding(lead) {
  const feeding = feedingOf(lead);
  return feeding === "exclusive" || feeding === "combination" || feeding === "weaning";
}

/** First name from the quiz. Never invent a city or baby name. */
export function leadNoteFirstName(lead) {
  const raw = String(lead?.first_name || "").trim().split(/\s+/)[0] || "";
  const cleaned = raw.replace(/[\r\n]+/g, "").slice(0, 40);
  if (!cleaned || !/^[A-Za-z]/.test(cleaned)) return "mama";
  return cleaned;
}

export function poundsToLose(lead) {
  const current = Number(lead?.current_weight_lbs);
  const goal = Number(lead?.goal_weight_lbs);
  if (!(current > 0) || !(goal > 0) || current < goal + 5) return null;
  return Math.round(current - goal);
}

function weightObservation(lead) {
  const pounds = poundsToLose(lead);
  if (pounds == null) return null;
  return {
    key: "weight_lose",
    text: `I saw you're looking to lose about ${pounds} pounds.`,
  };
}

/**
 * One quiz observation: breastfeeding (only if she is), postpartum season,
 * or pounds she wants to lose. Never name what she is not doing.
 */
export function pickLeadObservation(lead) {
  const months = monthsOf(lead);
  const segment = segmentOf(lead);
  const feeding = feedingOf(lead);

  if (hasFlag(lead, "vegan") || segment === "waitlist_plantbased") {
    if (hasFlag(lead, "vegan")) {
      return {
        key: "vegan",
        text: "I saw you're fully vegan. Happy to talk through how we handle that.",
      };
    }
    if (hasFlag(lead, "vegetarian")) {
      return {
        key: "vegetarian",
        text: "I saw you're vegetarian / pescatarian. Happy to talk through how we build around that.",
      };
    }
    return {
      key: "plant_based",
      text: "I saw plant-based on your quiz. I want to be straight with you about whether this group is a fit.",
    };
  }
  if (months === "still_pregnant" || segment === "pregnancy_nurture") {
    return {
      key: "pregnant",
      text: months === "still_pregnant"
        ? "I saw you're still pregnant. That's an abundance season, not a cut."
        : "I saw pregnancy on your quiz. That's an abundance season, not a cut.",
    };
  }
  if (feeding === "exclusive") {
    return {
      key: "feeding_exclusive",
      text: "I saw you're exclusively breastfeeding.",
    };
  }
  if (feeding === "combination") {
    return {
      key: "feeding_combination",
      text: "I saw you're combining breast milk and formula.",
    };
  }
  if (feeding === "weaning") {
    return {
      key: "feeding_weaning",
      text: "I saw you're weaning.",
    };
  }
  if (months === "0_3_months" || segment === "early_pp_nurture") {
    return {
      key: "early_pp",
      text: months === "0_3_months"
        ? "I saw you're in those first 0–3 months postpartum."
        : "I saw you're in those early postpartum months.",
    };
  }
  if (months === "3_12_months") {
    return {
      key: "pp_3_12",
      text: "I saw you're about 3–12 months postpartum.",
    };
  }
  if (months === "1_2_years") {
    return {
      key: "pp_1_2",
      text: "I saw you're 1–2 years postpartum.",
    };
  }
  if (months === "2_plus_years") {
    return {
      key: "pp_2_plus",
      text: "I saw you're 2+ years postpartum.",
    };
  }
  return weightObservation(lead) || {
    key: "fallback",
    text: "I looked back at your quiz.",
  };
}

export function pickPersonalConnection(observationKey) {
  if (String(observationKey || "").startsWith("feeding_")) {
    return "I too have felt how hard it is to take care of yourself while you're still feeding. That's why I built this program.";
  }
  if (
    observationKey === "early_pp"
    || observationKey === "pp_3_12"
    || observationKey === "pp_1_2"
    || observationKey === "pp_2_plus"
  ) {
    return "I too have felt inflamed, soft, and lethargic after having my babies. That's why I built this program.";
  }
  if (observationKey === "weight_lose") {
    return "I too have felt like I was giving everything away and had nothing left for my own body. That's why I built this program.";
  }
  return "I too have felt like I was pouring into everyone else and forgetting myself. That's why I built this program.";
}

export function formatPersonalNoteCopy({ subject, body }) {
  return `Subject: ${subject}\n\n${body}`;
}

export function buildPersonalNoteBody({ firstName, observation, connection, soft }) {
  const name = firstName || "mama";
  const lines = [
    `Hi, ${name}!`,
    "",
    `I'm sure you've gotten some automated emails from me. This is me, Callie writing a personal message to you, ${name}!`,
    "",
    observation,
    "",
  ];
  if (soft) {
    lines.push(
      "This cohort may not be the right fit right now. I'll tell you when it is.",
      "",
      "If you have any questions I'm available and checking emails.",
    );
  } else {
    lines.push(
      connection,
      "",
      INVITE_GUIDE_LINE,
      "",
      INVITE_JOIN_LINE,
    );
  }
  lines.push("", "Callie");
  return lines.join("\n");
}

function assertVoice(text) {
  const raw = String(text || "");
  if (raw.includes(EM_DASH)) {
    throw new Error("personal note used an em dash");
  }
  const lower = raw.toLowerCase();
  for (const phrase of BANNED) {
    if (lower.includes(phrase)) {
      throw new Error(`personal note used banned phrase: ${phrase}`);
    }
  }
  return text;
}

/**
 * @returns {{ kind: "paid", message: string } | {
 *   kind: "draft",
 *   subject: string,
 *   body: string,
 *   copyText: string,
 *   observationKey: string,
 *   observation: string,
 *   pitch: "invite" | "soft",
 *   firstName: string,
 * }}
 */
export function draftLeadPersonalNote(lead) {
  if (isPaidLead(lead)) {
    return { kind: "paid", message: PAID_NOTE_COPY };
  }

  const firstName = leadNoteFirstName(lead);
  const observation = pickLeadObservation(lead);
  const soft = isSoftPitchLead(lead);
  const connection = pickPersonalConnection(observation.key);
  const body = assertVoice(buildPersonalNoteBody({
    firstName,
    observation: observation.text,
    connection,
    soft,
  }));
  const subject = PERSONAL_NOTE_SUBJECT;
  return {
    kind: "draft",
    subject,
    body,
    copyText: formatPersonalNoteCopy({ subject, body }),
    observationKey: observation.key,
    observation: observation.text,
    pitch: soft ? "soft" : "invite",
    firstName,
  };
}

/** mailto with subject + body. Drops body (keeps subject) if the URL is too long. */
export function personalNoteMailtoHref(email, draft, { maxLen = MAILTO_MAX_LEN } = {}) {
  const to = String(email || "").trim();
  if (!to.includes("@") || !draft || draft.kind !== "draft") return "";
  const subject = encodeURIComponent(draft.subject);
  const body = encodeURIComponent(draft.body);
  const withBody = `mailto:${to}?subject=${subject}&body=${body}`;
  if (withBody.length <= maxLen) return withBody;
  return `mailto:${to}?subject=${subject}`;
}
