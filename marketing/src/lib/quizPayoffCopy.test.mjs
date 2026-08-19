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
    assert.doesNotMatch(quizJs, /App preview/);
    assert.doesNotMatch(quizJs, /not your final numbers/);
    assert.doesNotMatch(quizJs, /These are bands, not one rigid number/);
    assert.doesNotMatch(quizJs, /We emailed these ranges/);
  });

  it("shows the app tour before the compact offer and keeps the pre-pay card", () => {
    assert.match(quizJs, /function appTourHtml/);
    assert.match(quizJs, /function fastOfferHtml/);
    assert.match(quizJs, /Lock my spot · \$/);
    assert.match(quizJs, /Your quiz unlocked the early rate/);
    const tourAt = quizJs.indexOf("${appTourHtml()}");
    const fastAt = quizJs.indexOf("${fastOfferHtml()}");
    const offerAt = quizJs.indexOf("${offerBlock()}");
    assert.ok(tourAt > 0 && fastAt > tourAt && offerAt > fastAt);
  });

  it("tours Today, Meals, and Messages without extra proof cards", () => {
    assert.doesNotMatch(quizJs, /My meals · recipes/);
    assert.doesNotMatch(quizJs, /Progress · ranges/);
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
