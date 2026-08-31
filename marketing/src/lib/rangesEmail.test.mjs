import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EARLY_PRICE,
  RANGES_EMAIL_BOTTOM_CTA,
  SPLIT_AT_CHECKOUT,
  buildEligibleRangesEmailBody,
  emailCtaButton,
  quizJoinUrl,
  rangesOfferBlock,
} from "./rangesEmail.mjs";

const DASH_RE = /—/;

describe("quiz ranges email", () => {
  const joinUrl = quizJoinUrl("mama@example.com");
  const body = buildEligibleRangesEmailBody({
    earlyPp: false,
    needsReview: true,
    feedHtml: "<p>Even partial feeding costs a few hundred calories a day that no standard calculator accounts for. Yours does.</p>",
    bands: {
      protein: "140–150 g",
      carbs: "160–180 g",
      fat: "55–65 g",
      calories: "2,100–2,300",
    },
    joinUrl,
  });
  const withBottom = body + emailCtaButton(RANGES_EMAIL_BOTTOM_CTA, joinUrl);

  it("has no em or en dashes", () => {
    assert.equal(DASH_RE.test(withBottom), false);
    assert.equal(DASH_RE.test(rangesOfferBlock(joinUrl)), false);
    assert.equal(DASH_RE.test(RANGES_EMAIL_BOTTOM_CTA), false);
  });

  it("includes the offer unlock, two CTAs, and the checkout split line", () => {
    assert.match(body, /unlocked the \$249 early rate/);
    assert.match(body, /\$50 off \$299/);
    assert.doesNotMatch(body, /capped at 50|50 spots|50 mamas/i);
    assert.doesNotMatch(body, /The group starts Monday, Aug 31/);
    assert.doesNotMatch(body, /Aug 27|Aug 31|August 31/);
    assert.doesNotMatch(body, /Doors close/i);
    assert.doesNotMatch(body, /enrollment is open/i);
    assert.doesNotMatch(body, /8 weeks start when/i);
    assert.match(body, /Callie builds every set of ranges by hand, in the order mamas lock in/);
    assert.match(body, /Use this same email so your ranges stay attached/);
    assert.doesNotMatch(body, /Thursday/);
    assert.match(body, /Checkout offers 4 interest-free payments of \$62\.25/);
    assert.match(body, new RegExp(SPLIT_AT_CHECKOUT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(body, /approved|guaranteed|Klarna|Affirm/i);
    assert.doesNotMatch(body, /interest-free monthly/i);
    const lockButtons = withBottom.match(/Lock my spot · \$249/g) || [];
    const finishButtons = withBottom.match(/Finish signing up, lock in your spot/g) || [];
    assert.equal(lockButtons.length, 1);
    assert.equal(finishButtons.length, 1);
    assert.equal((withBottom.match(/background:#B4416B/g) || []).length, 2);
  });

  it("keeps the review-segment opening", () => {
    assert.match(body, /Callie will still review your finals personally/);
  });

  it("keeps the reply-anytime line", () => {
    assert.match(body, /Reply anytime/);
  });

  it("points checkout at the quiz join URL", () => {
    assert.match(joinUrl, /from=quiz/);
    assert.match(joinUrl, /email=mama%40example.com/);
    assert.match(body, /macrosandmamas\.com\/join\?from=quiz/);
  });

  it("uses the early price in the mid CTA", () => {
    assert.equal(EARLY_PRICE, 249);
  });
});
