/**
 * Pure-logic QA for Stage 1 credit helpers (no network).
 * Run: node scripts/qa-credits-math.mjs
 */
import { creditConsumedFromInvoice, summarizeLedger, vestingDays } from "../functions/_shared/credits.js";

let failed = 0;
function assert(name, cond) {
  if (!cond) {
    console.error("FAIL", name);
    failed += 1;
  } else {
    console.log("ok  ", name);
  }
}

assert("full credit apply", creditConsumedFromInvoice({ starting_balance: -2500, ending_balance: 0 }) === 2500);
assert("partial credit apply", creditConsumedFromInvoice({ starting_balance: -5000, ending_balance: -2000 }) === 3000);
assert("no credit", creditConsumedFromInvoice({ starting_balance: 0, ending_balance: 0 }) === 0);
assert("missing balances", creditConsumedFromInvoice({}) === 0);
assert(
  "positive starting balance is not treated as credit applied",
  creditConsumedFromInvoice({ starting_balance: 1000, ending_balance: 0 }) <= 0,
);

const sum = summarizeLedger([
  { status: "available", amount_cents: 2500 },
  { status: "pending", amount_cents: 2500 },
  { status: "redeemed", amount_cents: 2500 },
  { status: "reversed", amount_cents: -2500 },
  { status: "available", amount_cents: 1000 },
]);
assert("available sum", sum.availableCents === 3500);
assert("pending sum", sum.pendingCents === 2500);

assert("vesting default 3", vestingDays({}) === 3);
assert("vesting env", vestingDays({ VESTING_DAYS: "3" }) === 3);
assert("vesting override", vestingDays({ VESTING_DAYS: "7" }) === 7);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll credit math checks passed");
