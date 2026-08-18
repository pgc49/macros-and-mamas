import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const quizJs = readFileSync(join(root, "public/quiz-app.js"), "utf8");

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

  it("places a compact offer before proof and keeps the pre-pay card", () => {
    assert.match(quizJs, /function fastOfferHtml/);
    assert.match(quizJs, /Lock my spot · \$/);
    assert.match(quizJs, /Your quiz unlocked the early rate/);
    const fastAt = quizJs.indexOf("${fastOfferHtml()}");
    const snapAt = quizJs.indexOf("${snapProofHtml()}");
    const offerAt = quizJs.indexOf("${offerBlock()}");
    assert.ok(fastAt > 0 && snapAt > fastAt && offerAt > snapAt);
  });

  it("drops My meals and Progress proof cards", () => {
    assert.doesNotMatch(quizJs, /My meals · recipes/);
    assert.doesNotMatch(quizJs, /Progress · ranges/);
    assert.match(quizJs, /Messages · 1:1 with Callie/);
  });
});
