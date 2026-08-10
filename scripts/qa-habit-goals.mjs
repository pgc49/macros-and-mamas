/**
 * Smoke checks for custom goals + habit rhythm math (no DB).
 * Run: node scripts/qa-habit-goals.mjs
 */
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outdir = mkdtempSync(join(tmpdir(), "mm-habit-qa-"));
const goalsOut = join(outdir, "goals.mjs");
const rhythmOut = join(outdir, "rhythm.mjs");

function bundle(entry, outfile) {
  const r = spawnSync(
    "npx",
    ["--yes", "esbuild", entry, "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`],
    { cwd: root, encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    process.exit(1);
  }
}

bundle(join(root, "src/lib/goals.js"), goalsOut);
bundle(join(root, "src/lib/habitRhythm.js"), rhythmOut);

const goals = await import(pathToFileURL(goalsOut).href);
const rhythmMod = await import(pathToFileURL(rhythmOut).href);

const {
  adherenceForItems,
  goalCreatedDateIso,
  goalWeekTarget,
  mergeGoalItems,
} = goals;
const { buildHabitRhythm, goalActiveInWeek } = rhythmMod;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("ok:", msg);
  }
}

const program = mergeGoalItems([]);
assert(program.length === 6, "6 program goals when no custom");
assert(
  program.every((g) => ["macros", "water", "steps", "sun", "home", "strength"].includes(g.id)),
  "program goal ids unchanged (checkins carry over)",
);

const wk = "2026-08-03";
const checksByWeek = {
  [wk]: {
    "macros|M": true,
    "macros|T": true,
    "water|M": true,
    "water|T": true,
    "water|W": true,
    "steps|M": true,
    "sun|M": true,
    "home|M": true,
    "strength|M": true,
    "strength|W": true,
    "strength|F": true,
  },
};
const pct = adherenceForItems(checksByWeek, wk, program);
assert(pct > 0 && pct <= 100, `program-only week % is sane (${pct})`);

const prevTz = process.env.TZ;
process.env.TZ = "America/Los_Angeles";
const createdUtc = "2026-08-10 03:31:15.245639+00"; // Sun Aug 9 evening PDT
const createdLocal = goalCreatedDateIso(createdUtc);
assert(createdLocal === "2026-08-09", `local created date is Aug 9 PDT (got ${createdLocal})`);
const dailyItem = {
  id: "c1",
  source: "custom",
  daily: true,
  createdAt: createdUtc,
};
const target = goalWeekTarget(dailyItem, "2026-08-03");
assert(target === 1, `mid-week Sunday daily target is 1, not 0 (got ${target})`);
assert(goalWeekTarget({ id: "c2", source: "custom", daily: false, nTarget: 5, createdAt: createdUtc }, "2026-08-03") === 5, "5× week target stays 5");
assert(!goalActiveInWeek(dailyItem, "2026-07-27"), "custom inactive before create week");

const rhythm = buildHabitRhythm({
  checksByWeek,
  goalItems: program,
  curWk: "2026-08-10",
  earliestWk: "2026-08-03",
});
assert(rhythm.weeks.length >= 2, "rhythm includes contiguous weeks");
const w1 = rhythm.allSeries.find((w) => w.week === wk);
assert(w1 && w1.pct > 0, `W1 from existing checkins has pct > 0 (got ${w1?.pct})`);

process.env.TZ = prevTz;

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll habit/goal QA checks passed.");
