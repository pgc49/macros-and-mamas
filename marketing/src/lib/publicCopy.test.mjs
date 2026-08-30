import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const PUBLIC_SURFACES = [
  "src/config.ts",
  "src/components/Hero.astro",
  "src/components/Pricing.astro",
  "src/components/FinalCta.astro",
  "src/components/StickyCta.astro",
  "src/components/Faq.astro",
  "src/components/WaitlistForm.astro",
  "src/pages/quiz.astro",
  "public/quiz-app.js",
];

const FORBIDDEN = [
  /Aug 27/,
  /Aug 31/,
  /August 31/,
  /doors close/i,
  /capped at 50/i,
  /50 spots/i,
  /50 mamas/i,
  /enrollment is open/i,
  /enrollment open/i,
  /your 8 weeks start when/i,
];

describe("public marketing + quiz copy", () => {
  it("does not claim a close date, Aug 31 start lock, or 50-cap", () => {
    for (const rel of PUBLIC_SURFACES) {
      const text = readFileSync(join(root, rel), "utf8");
      for (const pattern of FORBIDDEN) {
        assert.doesNotMatch(text, pattern, `${rel} matches ${pattern}`);
      }
    }
  });

  it("uses hand-built ranges, in lock-in order", () => {
    const config = readFileSync(join(root, "src/config.ts"), "utf8");
    assert.match(
      config,
      /Callie builds every set of ranges by hand, in the order mamas lock in/,
    );
    const quizJs = readFileSync(join(root, "public/quiz-app.js"), "utf8");
    assert.match(
      quizJs,
      /Callie builds every set of ranges by hand, in the order mamas lock in/,
    );
  });
});
