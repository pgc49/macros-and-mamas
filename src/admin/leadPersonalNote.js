/**
 * Deterministic personal note for Callie to copy from admin lead detail.
 * No LLM. No send. Built only from persisted quiz fields we already show.
 * First-person Callie: heart, acknowledgment, no em dashes.
 */

export const PERSONAL_NOTE_SUBJECT = "Quick note from Callie";
export const PAID_NOTE_COPY = "She's already in. No outreach draft.";

/** Some mail apps choke past ~2k. Still show Copy when we drop the body. */
export const MAILTO_MAX_LEN = 2000;

const BANNED = [
  "i hope this email finds you well",
  "holistic nutritionist",
  "limited spots remaining",
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

function goalOf(lead) {
  return String(lead?.goal || "").trim();
}

function activityOf(lead) {
  return String(lead?.activity_level || "").trim();
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

function hasProteinRange(lead) {
  return lead?.protein_low_g != null || lead?.protein_high_g != null;
}

/**
 * One observation grounded in this lead's quiz. Priority is specific → general
 * so pregnant / early-PP / C-section / thyroid / plant-based stay distinct.
 */
export function pickLeadObservation(lead) {
  const months = monthsOf(lead);
  const segment = segmentOf(lead);
  const feeding = feedingOf(lead);
  const goal = goalOf(lead);
  const activity = activityOf(lead);

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
  if (hasFlag(lead, "vegetarian")) {
    return {
      key: "vegetarian",
      text: "I saw you're vegetarian / pescatarian. Happy to talk through how we build around that.",
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
  if (hasFlag(lead, "c_section")) {
    return {
      key: "c_section",
      text: "I saw you noted a recent C-section. Recovery and milk both matter here.",
    };
  }
  if (hasFlag(lead, "thyroid")) {
    return {
      key: "thyroid",
      text: "I saw thyroid on your quiz. That's something I work with when we set ranges. We don't ignore it.",
    };
  }
  if (hasFlag(lead, "blood_sugar")) {
    return {
      key: "blood_sugar",
      text: "I saw you flagged blood sugar concerns. We factor that in instead of throwing a generic cut at it.",
    };
  }
  if (months === "0_3_months" || segment === "early_pp_nurture") {
    return {
      key: "early_pp",
      text: months === "0_3_months"
        ? "I saw you're in those first 0–3 months postpartum. That's a lot of body and milk change at once."
        : "I saw you're in those early postpartum months. That's a lot of body and milk change at once.",
    };
  }
  if (feeding === "exclusive") {
    return {
      key: "feeding_exclusive",
      text: "I saw you're feeding exclusive breast milk right now. Your numbers have to protect milk, not just the scale.",
    };
  }
  if (feeding === "combination") {
    return {
      key: "feeding_combination",
      text: "I saw you're combination feeding. We can build around that mix.",
    };
  }
  if (feeding === "weaning") {
    return {
      key: "feeding_weaning",
      text: "I saw you're weaning. Appetite can swing in that window, and that's something I watch.",
    };
  }
  if (feeding === "not_feeding") {
    return {
      key: "feeding_not",
      text: "I saw you're not feeding breast milk right now. We can still build this around your real life.",
    };
  }
  if (months === "3_12_months") {
    return {
      key: "pp_3_12",
      text: "I saw you're about 3–12 months postpartum. That's still a real season.",
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
  if (months === "not_postpartum") {
    return {
      key: "not_postpartum",
      text: "I saw you're not postpartum right now.",
    };
  }
  if (goal === "lose_sustainable" || goal === "lose_efficient") {
    return {
      key: "goal_lose",
      text: "I saw you want to lose fat and keep muscle and milk. That's exactly how I coach.",
    };
  }
  if (goal === "maintain") {
    return {
      key: "goal_maintain",
      text: "I saw you're looking to maintain where you are.",
    };
  }
  if (goal === "gain") {
    return {
      key: "goal_gain",
      text: "I saw you're looking to gain / rebuild.",
    };
  }
  if (activity === "minimal") {
    return {
      key: "activity_minimal",
      text: "I saw you're in survival-mode movement right now. That's honest, and we start there.",
    };
  }
  if (activity === "light") {
    return {
      key: "activity_light",
      text: "I saw you're mostly doing light walks right now.",
    };
  }
  if (activity === "moderate") {
    return {
      key: "activity_moderate",
      text: "I saw you're moving at a moderate clip right now.",
    };
  }
  if (activity === "high") {
    return {
      key: "activity_high",
      text: "I saw you're already training consistently.",
    };
  }
  if (hasProteinRange(lead)) {
    return {
      key: "ranges",
      text: "I already sent you starting ranges. They're a starting point, not the whole program.",
    };
  }
  return {
    key: "fallback",
    text: "I looked back at your quiz. Happy to talk through whatever's on your mind.",
  };
}

export function formatPersonalNoteCopy({ subject, body }) {
  return `Subject: ${subject}\n\n${body}`;
}

function nursingSolidarityLine() {
  return "I'm still breastfeeding too. I'm nursing my 8 month old and managing a 4 year old, so I know what this season asks of you.";
}

function heartLine(lead) {
  if (monthsOf(lead) === "not_postpartum") {
    return "This program is for women giving their all to their children and their work. You still need to pour back into your own cup.";
  }
  return "This program is for women giving their all to their children and their work. Postpartum is such a selfless time, and you still need to pour back into your own cup.";
}

export function buildPersonalNoteBody({ firstName, observation, soft, nursing, lead }) {
  const name = firstName || "mama";
  const lines = [
    `Hi ${name},`,
    "",
    "You've probably gotten some automated emails from me. I wanted to reach out personally.",
    "",
    observation,
    "",
  ];
  if (nursing) {
    lines.push(nursingSolidarityLine(), "");
  }
  if (soft) {
    lines.push(
      "This cohort may not be the right fit right now. I'll tell you when it is.",
      "",
      "Reply anytime if you have a question about the program. I'm here.",
    );
  } else {
    lines.push(
      heartLine(lead),
      "",
      "I'd love to have you join. Doors close August 27.",
      "",
      "Reply anytime if you have a question about the program. I'm here.",
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
  const nursing = isStillBreastfeeding(lead);
  const body = assertVoice(buildPersonalNoteBody({
    firstName,
    observation: observation.text,
    soft,
    nursing,
    lead,
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
