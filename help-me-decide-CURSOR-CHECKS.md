# Help me decide — Cursor checks (for Claude)

Two things you asked me to check, not decide.

---

## 1. `sanitizePlanMeal` does **not** drop unknown keys

`src/utils/planMealShape.js`:

```js
return {
  ...meal,
  ingredients,
  ...(serving !== undefined ? { serving } : {}),
  batch,
  steps,
};
```

It only overwrites recipe arrays. Unknown fields survive.

The persist path is the same: `normalizeWeekDays` → `withMealId(sanitizePlanMeal(m))`, and `db.loadWeekPlan` / `saveWeekPlan` use `sanitizeWeekMeals`. Both spread. A new field on a PlanMeal **round-trips** through Supabase jsonb.

**Do not tag decide pencils with `basedOn: "decide"`.** `basedOn` is already the bank recipe name:

- `recipeToPlanMeal` sets `basedOn: recipe.name`
- `withRecipeDetail` / WeekPlanner hydrate ingredients from `RECIPE_DETAILS[basedOn]`
- UI can show “Based on Callie’s {basedOn}”
- `hydrateWeekPlanCustomIngredients` **skips** any row that has `basedOn` set

Overwriting that to `"decide"` would lose bank hydration and grocery lines.

**Use a new field:** `via: "decide"` (or `source: "decide"`). `sanitizePlanMeal` keeps it. `cloneDaysToPlan` is a whitelist, but that is only the seed/clone helper — do not run pencils through it.

Replace rule: a decide pencil for a slot is a plan meal with `via === "decide"` (and that slot, today). Leave Callie-added plan meals (`via` missing or not `"decide"`) alone, even if they share the slot.

---

## 2. `snapServings` already allows 0.75

`src/utils/servings.jsx`:

```js
export function snapServings(qty, { min = 0.25, max = 4, step = 0.25 } = {}) {
```

Default step is **0.25**. `snapServings(0.75)` returns `0.75`. `ServingStepper` already steps 0.25.

**Put 0.75 back in the scale list:** `[1, 1.5, 2, 0.75, 0.5]` as the original brief. Do not change `snapServings`.
