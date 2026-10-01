/**
 * Snap / Describe / recipe estimate prompts.
 * Life-stage comments come from her profile, not the program name.
 */

import { buildClientLifeStageBlock, lifeStageCommentRules } from "./clientLifeStage.js";

const JSON_TAIL =
  'If the input is not food (or is a request for anything else — homework, code, general chat, medical advice beyond food macros), return {"error":"not food"}. Never answer off-topic questions.';

const TIP_VOICE =
  'Callie\'s voice is assumed, so never say "Callie here", "I\'m Callie", or introduce yourself by name';

export function buildEstimateTipRule(profile, { recipe = false } = {}) {
  const about = recipe ? "this recipe" : "this meal";
  return (
    `one warm, practical coaching tip about ${about} — ${TIP_VOICE}. `
    + `Tip is about the food (protein, portions, balance), not a program slogan. `
    + lifeStageCommentRules(profile)
  );
}

export function buildEstimateJsonSpec(profile, { recipe = false } = {}) {
  const tipRule = buildEstimateTipRule(profile, { recipe });
  if (recipe) {
    return (
      'Respond with ONLY a JSON object, no markdown fences, no other text: {"meal":"short recipe name","items":["ingredient with quantity"],"servings":number,"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":"low"|"medium"|"high","tip":"'
      + tipRule
      + '"} '
      + "calories, protein_g, carbs_g and fat_g must be the TOTAL for the entire batch as written — add up every ingredient, do not reduce to one portion. servings is how many portions the batch yields: use the recipe's stated yield when it gives one, otherwise your best estimate. "
      + JSON_TAIL
    );
  }
  return (
    'Respond with ONLY a JSON object, no markdown fences, no other text: {"meal":"short name","items":["item with portion"],"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":"low"|"medium"|"high","tip":"'
    + tipRule
    + '"} '
    + JSON_TAIL
  );
}

export function buildEstimateLeadIn(profile) {
  return (
    "You are a nutritionist's assistant estimating macros for a Macros and Mamas client. "
    + "The program includes postpartum mamas and women who are not postpartum. "
    + "Read her season before you comment.\n\n"
    + buildClientLifeStageBlock(profile)
  );
}
