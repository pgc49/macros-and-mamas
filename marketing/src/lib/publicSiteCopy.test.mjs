import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Public Astro/JS copy only — skip email libs already handled in PR 300. */
function collectPublicFiles() {
  const files = [
    join(root, "src/config.ts"),
    join(root, "public/quiz-app.js"),
  ];
  for (const dir of ["src/pages", "src/components", "src/layouts", "src/content"]) {
    const abs = join(root, dir);
    for (const name of readdirSync(abs)) {
      if (/\.(astro|ts|js|mjs)$/.test(name)) files.push(join(abs, name));
    }
  }
  return files;
}

const LIVE_CLOSE_DATE = /Doors close[^.]*Aug 27|doors close[^.]*Aug 27|Doors close Thursday|doors close Thursday|doorsCloseDate\s*=\s*['"]Aug 27['"]|dataset\.doorsClose\s*\|\|\s*['"]Aug 27['"]/i;

describe("public marketing and quiz copy", () => {
  const files = collectPublicFiles();

  it("no longer claims Aug 27 as a live door-close date", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(
        text,
        LIVE_CLOSE_DATE,
        `${file} still claims Aug 27 / Thursday as a live close date`,
      );
    }
  });

  it("keeps the 50-cap and Aug 31 start as the public urgency line", () => {
    const config = readFileSync(join(root, "src/config.ts"), "utf8");
    assert.match(config, /when the 50 spots fill · starts \$\{cohortStartDate\}/);
    assert.match(config, /cohortStartDate = 'Monday, Aug 31'/);
    assert.doesNotMatch(config, /doorsCloseDate/);
    assert.doesNotMatch(config, /Doors close \$\{/);
  });
});
