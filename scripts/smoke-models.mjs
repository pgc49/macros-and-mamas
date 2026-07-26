/**
 * Smoke: estimate vs planning model chains stay separate.
 * Run: node scripts/smoke-models.mjs
 */
import {
  ESTIMATE_MODEL_CHAIN,
  PLAN_MODEL_CHAIN,
  resolveEstimateModels,
  resolvePlanModels,
  resolveModels,
} from "../functions/_shared/openrouter.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(ESTIMATE_MODEL_CHAIN[0] === "google/gemini-3.1-flash-lite", "estimate primary");
assert(ESTIMATE_MODEL_CHAIN.includes("google/gemini-3.5-flash-lite"), "estimate has 3.5 lite fallback");
assert(!ESTIMATE_MODEL_CHAIN.some((m) => m.includes("2.5")), "estimate chain dropped retiring 2.5");

assert(PLAN_MODEL_CHAIN[0] === "google/gemini-3.6-flash", "plan primary is 3.6 Flash");
assert(PLAN_MODEL_CHAIN.includes("google/gemini-3.5-flash"), "plan has 3.5 Flash fallback");
assert(PLAN_MODEL_CHAIN.includes("google/gemini-3.1-flash-lite"), "plan keeps lite as last resort");

const est = resolveEstimateModels({});
assert(est[0] === "google/gemini-3.1-flash-lite", "estimate resolve default");

// MEAL_PLAN_MODEL must NOT upgrade Snap/Describe.
const estWithPlanEnv = resolveEstimateModels({ MEAL_PLAN_MODEL: "google/gemini-3.6-flash" });
assert(
  estWithPlanEnv[0] === "google/gemini-3.1-flash-lite",
  `MEAL_PLAN_MODEL leaked into estimate chain: ${estWithPlanEnv[0]}`,
);

const plan = resolvePlanModels({});
assert(plan[0] === "google/gemini-3.6-flash", "plan resolve default");

const planOverride = resolvePlanModels({ MEAL_PLAN_MODEL: "google/gemini-3.5-flash" });
assert(planOverride[0] === "google/gemini-3.5-flash", "MEAL_PLAN_MODEL becomes plan primary");
assert(planOverride.includes("google/gemini-3.6-flash"), "default plan primary stays as fallback");

// Deprecated alias stays on the lite/estimate chain.
assert(resolveModels({})[0] === "google/gemini-3.1-flash-lite", "resolveModels alias = estimate");

console.log("OK models smoke", {
  estimate: resolveEstimateModels({}),
  plan: resolvePlanModels({}),
});
