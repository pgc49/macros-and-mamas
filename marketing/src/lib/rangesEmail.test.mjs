import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EARLY_PRICE,
  RANGES_EMAIL_BOTTOM_CTA,
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

  it("includes the offer unlock and two CTAs", () => {
    assert.match(body, /unlocked the \$249 early rate/);
    assert.match(body, /\$50 off \$299/);
    assert.match(body, /capped at 50 mamas/);
    assert.match(body, /doors close Aug 27/);
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
