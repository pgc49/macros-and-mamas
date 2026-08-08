/**
 * Callie's ranges engine — SOURCE OF TRUTH for the marketing quiz.
 * Derived from Callie's written method (QUIZ-SOURCE-OF-TRUTH).
 * Tunable constants live here; do not scatter magic numbers.
 */

export const CAL_MULT_NURSING = 13;
export const CAL_MULT_NOT_NURSING = 12;
export const PROTEIN_PER_LB = 1.0;
export const FAT_TOP_PER_LB = 0.5;
export const BAND_WIDTH_G = 10;
export const FLOOR_NURSING = 1800;
export const FLOOR_NOT_NURSING = 1500;
export const ACTIVITY_ROUND_UP = 0;

/** Nearest 5; halves up (toward +∞ for positives). */
export function round5(n) {
  return Math.round(n / 5) * 5;
}

/** Nearest 25; halves up. */
export function round25(n) {
  return Math.round(n / 25) * 25;
}

export function isNursing(feeding) {
  return (
    feeding === 'exclusive' ||
    feeding === 'combination' ||
    feeding === 'weaning'
  );
}

export function goalBmi(goalWeightLbs, heightIn) {
  if (!(heightIn > 0) || !(goalWeightLbs > 0)) return NaN;
  return (703 * goalWeightLbs) / (heightIn * heightIn);
}

function review(reason) {
  return { needs_review: true, review_reason: reason };
}

/**
 * Compute macro bands from raw answers.
 * Review triggers show NO numbers — unless skipReview (UI / email preview path).
 * skipReview still returns estimated cut-style bands so the app preview can
 * render; Callie approves finals after join. Incomplete inputs still fail.
 * @param {object} answers
 * @param {{ skipReview?: boolean }} [opts]
 */
export function computeRanges(answers, opts = {}) {
  const skipReview = opts.skipReview === true;
  const gw = Number(answers.goal_weight_lbs);
  const cw = Number(answers.current_weight_lbs);
  const height = Number(answers.height_in);
  const feeding = answers.feeding;
  const flags = Array.isArray(answers.flags) ? answers.flags : [];

  if (!(gw > 0) || !(height > 0)) {
    return review('incomplete_inputs');
  }

  // Maintain / gain still need Callie's eyes — unless soft preview for the quiz payoff.
  if (!skipReview && (answers.goal === 'maintain' || answers.goal === 'gain')) {
    return review(answers.goal === 'maintain' ? 'goal_maintain' : 'goal_gain');
  }

  if (!skipReview && flags.includes('thyroid')) {
    return review('thyroid');
  }

  const bmi = goalBmi(gw, height);
  if (!skipReview && Number.isFinite(bmi) && bmi < 19) {
    return review('goal_bmi_under_19');
  }

  if (!skipReview && cw > 0 && gw < cw * 0.75) {
    return review('goal_over_25pct_below_current');
  }

  const nursing = isNursing(feeding);
  const mult = nursing ? CAL_MULT_NURSING : CAL_MULT_NOT_NURSING;
  const floor = nursing ? FLOOR_NURSING : FLOOR_NOT_NURSING;

  let calMin = gw * mult + ACTIVITY_ROUND_UP;
  calMin = Math.max(calMin, floor);

  const protein_low_g = round5(gw * PROTEIN_PER_LB);
  const protein_high_g = protein_low_g + BAND_WIDTH_G;
  const fat_high_g = round5(gw * FAT_TOP_PER_LB);
  const fat_low_g = fat_high_g - BAND_WIDTH_G;

  // Protein at goal weight grams, fat at TOP of band — per Callie.
  const carbCals = calMin - gw * 4 - fat_high_g * 9;
  let carbs_low_g = round5(carbCals / 4);
  if (skipReview && carbs_low_g < 100) carbs_low_g = 100;
  const carbs_high_g = carbs_low_g + BAND_WIDTH_G;

  if (!skipReview && carbs_low_g < 100) {
    return review('carbs_under_100');
  }

  // Exact from displayed macros — do not round25 here or P/C/F won't sum to calories
  // (skeptical users check this; the pitch is that calculators get the math wrong).
  const calories_low = protein_low_g * 4 + carbs_low_g * 4 + fat_low_g * 9;
  const calories_high = protein_high_g * 4 + carbs_high_g * 4 + fat_high_g * 9;

  return {
    needs_review: false,
    review_reason: null,
    protein_low_g,
    protein_high_g,
    carbs_low_g,
    carbs_high_g,
    fat_low_g,
    fat_high_g,
    calories_low,
    calories_high,
  };
}

/** Landing-page sample card: goal 150, exclusive nursing. */
export function sampleCardRanges() {
  const r = computeRanges({
    months_postpartum: '3_12_months',
    feeding: 'exclusive',
    height_in: 65,
    current_weight_lbs: 170,
    goal_weight_lbs: 150,
    goal: 'lose_sustainable',
    activity_level: 'moderate',
    flags: [],
  });
  if (r.needs_review) {
    throw new Error('sample card engine unexpectedly needs review');
  }
  return {
    protein_low_g: r.protein_low_g,
    protein_high_g: r.protein_high_g,
    carbs_low_g: r.carbs_low_g,
    carbs_high_g: r.carbs_high_g,
    fat_low_g: r.fat_low_g,
    fat_high_g: r.fat_high_g,
    calories_low: r.calories_low,
    calories_high: r.calories_high,
  };
}

export function segmentForAnswers(answers) {
  if (answers.months_postpartum === 'still_pregnant') return 'pregnancy_nurture';
  if (answers.flags?.includes('vegan')) return 'waitlist_plantbased';
  if (answers.months_postpartum === '0_3_months') return 'early_pp_nurture';
  return 'main';
}

export function feedingLine(feeding) {
  switch (feeding) {
    case 'exclusive':
      return "You're producing roughly 25 ounces a day. That's about 450 calories before you've done anything else, and it's already built into these numbers.";
    case 'combination':
      return 'Even partial feeding costs a few hundred calories a day that no standard calculator accounts for. Yours does.';
    case 'weaning':
      return 'Your needs are dropping as you wean, but slower than most calculators assume.';
    case 'not_feeding':
    default:
      return 'Your body is still rebuilding. Undereating now is how people stall for a year.';
  }
}
