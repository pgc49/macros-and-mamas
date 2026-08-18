/**
 * Node native tests for Callie's ranges engine.
 * Run: node --experimental-strip-types --test src/lib/rangesEngine.test.mjs
 * (from marketing/)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRangeBands,
  computeRanges,
  sampleCardRanges,
  round5,
  buildQuizPayoff,
  feedingLine,
} from './rangesEngine.mjs';

function base(over = {}) {
  return {
    months_postpartum: '3_12_months',
    feeding: 'exclusive',
    height_in: 65,
    current_weight_lbs: 170,
    goal_weight_lbs: 140,
    goal: 'lose_sustainable',
    activity_level: 'moderate',
    flags: [],
    ...over,
  };
}

describe('round5 halves up', () => {
  it('157.5 → 160', () => {
    assert.equal(round5(157.5), 160);
  });
});

describe('computeRanges — Callie cases', () => {
  it('goal 140 exclusive → Callie card corrected carbs', () => {
    const r = computeRanges(base({ goal_weight_lbs: 140 }));
    assert.equal(r.needs_review, false);
    assert.equal(r.protein_low_g, 140);
    assert.equal(r.protein_high_g, 150);
    assert.equal(r.fat_low_g, 60);
    assert.equal(r.fat_high_g, 70);
    assert.equal(r.carbs_low_g, 160);
    assert.equal(r.carbs_high_g, 170);
    // Exact P/C/F sum — not rounded to 25
    assert.equal(r.calories_low, 1740);
    assert.equal(r.calories_high, 1910);
  });

  it('goal 150 exclusive → sample card', () => {
    const r = computeRanges(base({ goal_weight_lbs: 150 }));
    assert.equal(r.needs_review, false);
    assert.equal(r.protein_low_g, 150);
    assert.equal(r.protein_high_g, 160);
    assert.equal(r.fat_low_g, 65);
    assert.equal(r.fat_high_g, 75);
    assert.equal(r.carbs_low_g, 170);
    assert.equal(r.carbs_high_g, 180);
    assert.equal(r.calories_low, 1865);
    assert.equal(r.calories_high, 2035);
  });

  it('sampleCardRanges matches engine(150, exclusive)', () => {
    const s = sampleCardRanges();
    const r = computeRanges(base({ goal_weight_lbs: 150 }));
    assert.deepEqual(s, {
      protein_low_g: r.protein_low_g,
      protein_high_g: r.protein_high_g,
      carbs_low_g: r.carbs_low_g,
      carbs_high_g: r.carbs_high_g,
      fat_low_g: r.fat_low_g,
      fat_high_g: r.fat_high_g,
      calories_low: r.calories_low,
      calories_high: r.calories_high,
    });
  });

  it('goal 130 exclusive → ×13 with no nursing floor; carbs from 1690', () => {
    const r = computeRanges(base({ goal_weight_lbs: 130 }));
    assert.equal(r.needs_review, false);
    assert.equal(r.protein_low_g, 130);
    assert.equal(r.fat_high_g, 65);
    // 1800 floor would have made carbs 175; ×13 only is 130*13=1690 → 145
    assert.equal(r.carbs_low_g, 145);
    assert.equal(r.carbs_high_g, 155);
    assert.equal(r.calories_low, 1595);
    assert.equal(r.calories_high, 1765);
  });

  it('nursing never applies the 1500 non-nursing floor', () => {
    const r = computeRangeBands({ goalWeightLbs: 110, nursing: true });
    assert.equal(r.ok, true);
    assert.equal(r.calMin, 1430);
    assert.equal(r.floorApplied, false);
    assert.equal(r.carbs_low_g, 125);
  });

  it('goal 140 not_feeding → no floor bind path', () => {
    const r = computeRanges(
      base({ goal_weight_lbs: 140, feeding: 'not_feeding' }),
    );
    assert.equal(r.needs_review, false);
    // cal_min = 1680; fat_high 70; carb_cals = 1680-560-630=490 → 122.5 → 125
    assert.equal(r.carbs_low_g, 125);
    assert.equal(r.carbs_high_g, 135);
  });
});

describe('review triggers', () => {
  it('carbs_low < 100 → review', () => {
    // Very low goal while nursing → carbs collapse
    const r = computeRanges(
      base({
        goal_weight_lbs: 90,
        current_weight_lbs: 95,
        height_in: 70, // BMI ok
      }),
    );
    assert.equal(r.needs_review, true);
    assert.ok(
      r.review_reason === 'carbs_under_100' ||
        r.review_reason === 'goal_bmi_under_19',
    );
  });

  it('goal 30% below current → review', () => {
    const r = computeRanges(
      base({ goal_weight_lbs: 140, current_weight_lbs: 200 }),
    );
    assert.equal(r.needs_review, true);
    assert.equal(r.review_reason, 'goal_over_25pct_below_current');
  });

  it('goal BMI < 19 → review', () => {
    const r = computeRanges(
      base({
        goal_weight_lbs: 110,
        current_weight_lbs: 120,
        height_in: 68,
      }),
    );
    assert.equal(r.needs_review, true);
    assert.equal(r.review_reason, 'goal_bmi_under_19');
  });

  it('thyroid → review', () => {
    const r = computeRanges(base({ flags: ['thyroid'] }));
    assert.equal(r.needs_review, true);
    assert.equal(r.review_reason, 'thyroid');
  });

  it('maintain → review', () => {
    const r = computeRanges(base({ goal: 'maintain' }));
    assert.equal(r.needs_review, true);
    assert.equal(r.review_reason, 'goal_maintain');
  });

  it('gain → review', () => {
    const r = computeRanges(base({ goal: 'gain' }));
    assert.equal(r.needs_review, true);
    assert.equal(r.review_reason, 'goal_gain');
  });

  it('skipReview returns bands for thyroid (quiz payoff preview path)', () => {
    const blocked = computeRanges(base({ flags: ['thyroid'] }));
    assert.equal(blocked.needs_review, true);
    const soft = computeRanges(base({ flags: ['thyroid'] }), { skipReview: true });
    assert.equal(soft.needs_review, false);
    assert.ok(soft.protein_low_g > 0);
  });

  it('skipReview returns bands for maintain / gain', () => {
    const blocked = computeRanges(base({ goal: 'maintain' }));
    assert.equal(blocked.needs_review, true);
    const soft = computeRanges(base({ goal: 'maintain' }), { skipReview: true });
    assert.equal(soft.needs_review, false);
    assert.ok(soft.protein_low_g > 0);
  });
});

describe('buildQuizPayoff', () => {
  it('returns preview bands + feeding line for exclusive nursing', () => {
    const p = buildQuizPayoff(base({ goal_weight_lbs: 150 }));
    assert.equal(p.segment, 'main');
    assert.equal(p.qualified_lead, true);
    assert.equal(p.needs_review, false);
    assert.ok(p.ranges?.protein_low_g);
    assert.equal(p.feeding_line, feedingLine('exclusive'));
  });

  it('skips ranges for pregnancy', () => {
    const p = buildQuizPayoff(base({ months_postpartum: 'still_pregnant' }));
    assert.equal(p.segment, 'pregnancy_nurture');
    assert.equal(p.qualified_lead, false);
    assert.equal(p.ranges, null);
    assert.equal(p.feeding_line, null);
  });

  it('hides feeding line for not_postpartum', () => {
    const p = buildQuizPayoff(
      base({ months_postpartum: 'not_postpartum', feeding: 'not_feeding' }),
    );
    assert.ok(p.ranges?.protein_low_g);
    assert.equal(p.feeding_line, null);
  });

  it('still shows preview bands when hard review fires', () => {
    const p = buildQuizPayoff(base({ flags: ['thyroid'] }));
    assert.equal(p.needs_review, true);
    assert.ok(p.ranges?.protein_low_g);
  });

  it('does not qualify fully vegan finishes', () => {
    const p = buildQuizPayoff(base({ flags: ['vegan'] }));
    assert.equal(p.segment, 'waitlist_plantbased');
    assert.equal(p.qualified_lead, false);
    assert.ok(p.ranges?.protein_low_g);
  });
});
