import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const quizJs = readFileSync(join(root, "public/quiz-app.js"), "utf8");
const testimonialsTs = readFileSync(join(root, "src/content/testimonials.ts"), "utf8");

describe("quiz payoff copy", () => {
  it("uses the ready H1 and a single preview sentence", () => {
    assert.match(quizJs, /your ranges are ready\./);
    assert.equal((quizJs.match(/A preview built from your answers/g) || []).length, 1);
    assert.doesNotMatch(quizJs, /This is a preview/);
    assert.doesNotMatch(quizJs, /not your final numbers/);
    assert.doesNotMatch(quizJs, /These are bands, not one rigid number/);
    assert.doesNotMatch(quizJs, /We emailed these ranges/);
  });

  it("shows the app tour before the compact offer and keeps the lock-your-spot card", () => {
    assert.match(quizJs, /function appTourHtml/);
    assert.match(quizJs, /function fastOfferHtml/);
    assert.match(quizJs, /Lock my spot · \$/);
    assert.match(quizJs, /Your quiz unlocked the early rate/);
    assert.match(quizJs, /\$\$\{offerPrice\} · full rate \$\$\{fullPrice\} · \$\{escapeHtml\(startShort\)\} group/);
    assert.match(quizJs, /8 weeks 1:1 with Callie\. She builds your ranges by hand/);
    assert.match(quizJs, /Split it at checkout: 4 interest-free payments of \$62\.25\./);
    assert.doesNotMatch(quizJs, /or monthly/);
    assert.doesNotMatch(quizJs, /\$50 off/);
    assert.doesNotMatch(quizJs, /capped at 50 mamas · /);
    assert.doesNotMatch(quizJs, /group, capped at 50 mamas/);
    assert.match(quizJs, /Callie hand-builds every set of ranges before day one/);
    assert.match(quizJs, /The whole group starts together \$\{escapeHtml\(cohortStart\)\}, capped at 50 mamas/);
    assert.match(quizJs, /When the 50 spots fill/);
    assert.doesNotMatch(quizJs, /Doors close/i);
    assert.doesNotMatch(quizJs, /Aug 27/);
    assert.doesNotMatch(quizJs, /Thursday/);
    assert.match(quizJs, /Checkout can split it into 4 interest-free payments of \$62\.25/);

    assert.match(quizJs, /custom ranges built by Callie · 1:1 messaging · the app · weekly check-ins/);
    assert.match(quizJs, /or 4 payments of \$62 at checkout/);
    assert.doesNotMatch(quizJs, /[Pp]re-pay|[Pp]repay/);
    assert.doesNotMatch(quizJs, /interest-free monthly/i);
    assert.doesNotMatch(quizJs, /You're joining the group that starts/);
    assert.match(quizJs, /const show = rangesOut && !offerInView/);
    assert.doesNotMatch(quizJs, /rootMargin: '0px 0px -12% 0px'/);
    const tourAt = quizJs.indexOf("${appTourHtml()}");
    const fastAt = quizJs.indexOf("${fastOfferHtml()}");
    const offerAt = quizJs.indexOf("${offerBlock()}");
    assert.ok(tourAt > 0 && fastAt > tourAt && offerAt > fastAt);
  });

  it("tours Today, Meals, and Messages without extra proof cards", () => {
    assert.doesNotMatch(quizJs, /My meals · recipes/);
    assert.doesNotMatch(quizJs, /Progress · ranges/);
    assert.match(quizJs, /App preview/);
    assert.match(quizJs, /A small snapshot of the inside/);
    assert.match(quizJs, /Simple tracking, easy logging/);
    assert.doesNotMatch(quizJs, /Four ways to log/);
    assert.match(quizJs, /Today · log a meal/);
    assert.match(quizJs, /All meals · Callie's recipes/);
    assert.match(quizJs, /Messages · 1:1 with Callie/);
    assert.match(quizJs, /Add to Today/);
    assert.match(quizJs, /Water · 40 of 88 oz/);
    assert.doesNotMatch(quizJs, /function snapProofHtml/);
    assert.doesNotMatch(quizJs, /function messagesProofHtml/);
  });

  it("uses Callie's 1:1 program note, not the 2am quiz quote", () => {
    assert.match(quizJs, /connect with each client 1:1/);
    assert.match(quizJs, /the program I needed and couldn't find/);
    assert.doesNotMatch(quizJs, /2am math on milk supply/);
  });

  it("leads payoff quotes with Becca, then Lauren and Coti", () => {
    assert.match(testimonialsTs, /\["becca", "lauren", "coti"\]/);
  });

  it("uses functional nutritionist as Callie's title", () => {
    assert.match(quizJs, /Callie, certified functional nutritionist and mama of two/);
    assert.match(quizJs, /Certified functional nutritionist · blood chemistry certified · mama of two/);
    assert.doesNotMatch(quizJs, /holistic nutritionist/i);
    assert.doesNotMatch(quizJs, /Holistic Nutritionist/);
  });

  it("still shows payoff when /api/lead fails", () => {
    assert.match(quizJs, /function localPayoff/);
    assert.match(quizJs, /__mmBuildQuizPayoff/);
    assert.match(quizJs, /We couldn't email these just now/);
  });
});
