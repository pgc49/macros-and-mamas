/**
 * Map a marketing_leads row → intake profile patches.
 * Only overlapping fields; intake remains editable and wins on submit.
 */

import { givenNameForWrite } from "./personName";

const MONTHS_PP_MID = {
  "0_3_months": "2",
  "3_12_months": "6",
  "1_2_years": "18",
  "2_plus_years": "30",
};

function isBlank(value) {
  return value == null || String(value).trim() === "";
}

/** @param {Record<string, unknown>} lead */
export function mapLeadToIntakePatch(lead) {
  if (!lead || typeof lead !== "object") return { patch: {}, notes: [] };

  const patch = {};
  const notes = [];
  const flags = Array.isArray(lead.flags) ? lead.flags.map(String) : [];
  const months = String(lead.months_postpartum || "");
  const feeding = String(lead.feeding_status || "");
  const goal = String(lead.goal || "");
  const activity = String(lead.activity_level || "");

  if (lead.first_name) {
    patch.name = givenNameForWrite(lead.first_name, lead.last_name);
  }
  if (lead.last_name) {
    patch.lastName = String(lead.last_name).trim();
  }

  if (lead.current_weight_lbs != null && Number(lead.current_weight_lbs) > 0) {
    patch.currentWeight = String(Math.round(Number(lead.current_weight_lbs)));
  }
  if (lead.goal_weight_lbs != null && Number(lead.goal_weight_lbs) > 0) {
    patch.goalWeight = String(Math.round(Number(lead.goal_weight_lbs)));
  }

  if (months === "still_pregnant") {
    patch.pregnant = true;
    patch.breastfeeding = null;
    patch.monthsPP = "";
  } else if (months) {
    patch.pregnant = false;
    if (feeding === "not_feeding" || months === "not_postpartum") {
      patch.breastfeeding = false;
      patch.monthsPP = "";
    } else if (
      feeding === "exclusive"
      || feeding === "combination"
      || feeding === "weaning"
    ) {
      patch.breastfeeding = true;
      patch.monthsPP = MONTHS_PP_MID[months] || "";
    } else if (MONTHS_PP_MID[months]) {
      // Postpartum bucket but feeding unknown — leave BF for her to confirm.
      patch.monthsPP = MONTHS_PP_MID[months];
    }
  }

  // lose_efficient kept for leads captured before the quiz collapsed to one lose option.
  if (goal === "lose_sustainable" || goal === "lose_efficient") {
    patch.goal = "lose";
  } else if (goal === "maintain" || goal === "gain") {
    patch.goal = goal;
  }

  if (activity === "minimal" || activity === "light") {
    patch.activity = "low";
  } else if (activity === "moderate" || activity === "high") {
    patch.activity = activity;
  }

  if (flags.includes("blood_sugar")) {
    patch.insulinResistance = true;
  }
  if (flags.includes("vegetarian") && !flags.includes("vegan")) {
    patch.diet = "vegetarian";
  }

  const seasonBits = [];
  if (flags.includes("vegan")) {
    seasonBits.push("Quiz: fully vegan kitchen");
  }
  if (flags.includes("thyroid")) {
    seasonBits.push("Quiz: thyroid");
  }
  if (flags.includes("c_section")) {
    seasonBits.push("Quiz: recent C-section");
  }
  if (flags.includes("vegetarian") && flags.includes("vegan") === false) {
    /* diet already set */
  }
  if (lead.height_in != null && Number(lead.height_in) > 0) {
    seasonBits.push(`Quiz height: ${Number(lead.height_in)} in`);
  }
  if (seasonBits.length) {
    notes.push(...seasonBits);
    patch.seasonNote = seasonBits.join(" · ");
  }

  return { patch, notes };
}

/**
 * Merge quiz patch into current profile — only fill blanks / defaults.
 * Never overwrite a value she already typed.
 */
export function mergeQuizPrefill(profile, patch) {
  if (!patch || !profile) {
    return { next: profile, appliedKeys: [] };
  }
  const next = { ...profile };
  const appliedKeys = [];

  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") continue;

    if (key === "pregnant" || key === "breastfeeding" || key === "insulinResistance") {
      // pregnant/breastfeeding default null; only fill when still unset
      if (key === "insulinResistance") {
        if (value === true && next.insulinResistance !== true) {
          next.insulinResistance = true;
          appliedKeys.push(key);
        }
        continue;
      }
      if (next[key] == null) {
        next[key] = value;
        appliedKeys.push(key);
      }
      continue;
    }

    if (key === "diet") {
      if (!next.diet || next.diet === "none") {
        next.diet = value;
        appliedKeys.push(key);
      }
      continue;
    }

    if (key === "stress") {
      continue; // quiz has no stress — leave intake default
    }

    if (key === "seasonNote") {
      const existing = String(next.seasonNote || "").trim();
      const incoming = String(value).trim();
      if (!existing) {
        next.seasonNote = incoming;
        appliedKeys.push(key);
      } else if (incoming && !existing.includes(incoming)) {
        next.seasonNote = `${existing}\n${incoming}`;
        appliedKeys.push(key);
      }
      continue;
    }

    if (isBlank(next[key])) {
      next[key] = value;
      appliedKeys.push(key);
    }
  }

  return { next, appliedKeys };
}
