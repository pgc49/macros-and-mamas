/**
 * Smoke checks for remaining / room / overage copy on range bands.
 * Run: node scripts/smoke-range-progress.mjs
 */
import { rangeState, rangeProgress, formatRangeProgress } from "../src/utils/rangeProgress.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(rangeState(0, 140, 150) === "empty", "0 is empty");
assert(rangeState(45, 140, 150) === "under", "45 under");
assert(rangeState(145, 140, 150) === "in", "145 in");
assert(rangeState(160, 140, 150) === "over", "160 over");

const under = rangeProgress(45, 140, 150);
assert(under.state === "under" && under.leftLo === 95 && under.leftHi === 105, `under math ${JSON.stringify(under)}`);

const inBand = rangeProgress(145, 140, 150);
assert(inBand.state === "in" && inBand.room === 5, `in-room ${JSON.stringify(inBand)}`);

const atTop = rangeProgress(150, 140, 150);
assert(atTop.state === "in" && atTop.room === 0, `at top ${JSON.stringify(atTop)}`);

const over = rangeProgress(160, 140, 150);
assert(over.state === "over" && over.over === 10, `over math ${JSON.stringify(over)}`);

const underCopy = formatRangeProgress(45, 140, 150, "g");
assert(
  underCopy.logged === "45g logged" && underCopy.detail === "95–105g left",
  `under copy ${JSON.stringify(underCopy)}`,
);

const inCopy = formatRangeProgress(145, 140, 150, "g");
assert(
  inCopy.logged === "145g logged" && inCopy.detail === "5g room",
  `in copy ${JSON.stringify(inCopy)}`,
);

const topCopy = formatRangeProgress(150, 140, 150, "g");
assert(topCopy.detail === "at the top", `top copy ${JSON.stringify(topCopy)}`);

const overCopy = formatRangeProgress(160, 140, 150, "g");
assert(
  overCopy.logged === "160g logged" && overCopy.detail === "10g over",
  `over copy ${JSON.stringify(overCopy)}`,
);

const calCopy = formatRangeProgress(450, 1750, 1900, " cal");
assert(
  calCopy.detail === "1300–1450 cal left",
  `cal remaining ${JSON.stringify(calCopy)}`,
);

assert(formatRangeProgress(0, 140, 150, "g") === null, "empty → null caption");

console.log("OK range-progress smoke", {
  under: underCopy.detail,
  in: inCopy.detail,
  over: overCopy.detail,
  cal: calCopy.detail,
});
