# Help me decide — section 14 answers

For Claude. Builds on PR 330 (`cursor/meals-fits-remaining-9347`). Do not change 330’s fit rule or UI. Section 15 (Callie copy, shares, knows-you) is hers — not answered here.

---

## 14.1 Planned entries

Yes. Help me decide can pencil into the existing planner store for today. It is **not** keyed by date+slot.

- **Store:** Supabase `client_week_plans` keyed `(profile_id, week_start)` (Monday). JSON `days[]` of `{ day: "Mon"…"Sun", meals: PlanMeal[] }`. Fallback `localStorage` `mm_week_plan_${uid}_${weekStart}`.
- **Load/save:** `src/db/db.js` `loadWeekPlan` / `saveWeekPlan`. Helpers in `src/utils/weekPlan.js`: `recipeToPlanMeal`, `customMealToPlanMeal`, `aiIdeaToPlanMeal`, `addMealToDay`, `normalizeWeekDays`.
- **PlanMeal shape:** `{ id, slot, name, basedOn, desc, cal, p, c, f, servings, qty, ingredients[], batch, steps[] }`. `slot` is a field, not a unique key. Multiple snacks per day are fine.
- **Today already reads it:** `src/App.jsx` `planMealsForLogDate` slices `days` by `planDayLabel(mealLogDate)` and passes them to `MealLogCard` as `plannedMeals`.
- **Grocery** reads the same `days[]` via `src/utils/groceryList.js` `buildGroceryList`. Pencils that write `addMealToDay` for today automatically show on the Meals board and grocery. No extra store.
- **Writer** must go through `App.jsx` (`onWeekPlanChange` / `persistWeekPlan`). `MealLogCard` cannot write the plan today. Resolve `dayKey = planDayLabel(date)` and load the week if `wkStartOf(date) !== weekPlanWeekStart`. Use the existing helpers so grocery sanitization does not drop the meal.

**Implication for 7.6:** Pencil in is a shared write, not a new table. The greyed “Ate it” row on Today is new UI over the same plan meal (match by `id` or name+slot). Ate it should call existing `logRecipe` / `appendMealEntry`, then leave or clear the plan row (product call: leave it so grocery still has it, or remove after eat).

---

## 14.2 Generate options call

Lives. Reuse it; extend inputs. Do not invent a second client.

- **UI:** `src/components/WeekPlanner.jsx` and `src/components/MyMealsAddSheet.jsx` `runOptions()` → `onMealIdea({ mode: "options", slot })`.
- **Client:** `src/App.jsx` `onMealIdea`.
- **API:** `functions/api/meal-idea.js` `mode === "options"`.
- **Prompt:** `functions/_shared/clientMealIdeaPrompt.js` `buildSlotOptionsPrompt`.
- Client sends only `{ mode, slot }`. Server loads profile (Foods I love `prefB` / `prefL` / `prefD` / `prefS`, diet, allergens, foodAvoids), approved macros (day bands, not a slot budget), `CALLIE_RECIPES`, custom meals.
- Does **not** receive remaining, dayTotals, kitchen list, or rejected names today. Eating-out mode already gets `remaining` / `dayTotals`. Options does not.
- **Model:** `google/gemini-3.1-flash-lite` via `functions/_shared/openrouter.js`. Fallback flash-lite chain. `maxTokens: 8000`, `temperature: 0.3`, JSON object.
- **Returns** structured JSON: `{ meals: [{ slot, name, basedOn, desc, cal, p, c, f, servings, ingredients: [{item, amount}], batch, steps[] }] }` — up to 3. Ingredients and steps are arrays, not prose. `sanitizePlanMeal` on the way out.

**Slice B:** add a mode or extend `options` with `budget`, `ingredients`, `rejected`, `refine`, `bankMatches`. Keep one `/api/meal-idea` client.

---

## 14.3 Eating out picks call

Same endpoint, different mode. Today → Menu already reuses it.

- **UI:** `src/components/EatingOutMenuFlow.jsx` `runPicks()`.
- **Surfaces:** Today Snap → Menu (`MealLogCard`, logs `via: "menu"`) and WeekPlanner eating-out (`Add to plan`). Same AI, different `onPick`.
- **Call:** `onMealIdea({ mode: "eating_out", slot, description, files, remaining, dayTotals })`. Up to 3 menu photos, optional caption. **Requires at least one photo** today (`400` if missing).
- **Prompt:** `buildEatingOutPrompt`. Returns up to **5** meals with `rankLabel`, rough macros, order-tip `steps`. Client re-ranks with `rankEatingOutPicks`.
- Image + text: yes, multimodal OpenRouter.

**Slice D:** reuse this call; change 5 → 3; add Get / Skip / Ask in the prompt; allow name/cuisine without a photo (today photo is required — that is a real API change). Fit badge: `mealFitsRemaining` against the **slot budget**, not day remaining.

---

## 14.4 Food prefs schema

On the client `profile` object. Readable. Not structured likes/dislikes arrays.

| UI | Client | DB |
|---|---|---|
| Foods you love B/L/D/S | `prefB` `prefL` `prefD` `prefS` | `profiles.pref_b` etc. free text ≤500 |
| How do you eat? | `diet` | `none` / `pescatarian` / `vegetarian` / `vegan` |
| Allergies chips | `allergens` | `text[]` |
| Other allergens | `allergenNote` | `allergen_note` |
| Soft avoids | `foodAvoids` | `food_avoids` |

Editor: `src/components/FoodPrefsEditor.jsx`. Save: `db.updateFoodPrefs`. Server AI already uses `buildDietSafetyBlock` + `tastesBlock`.

**Implication for 7.7 / ranker:** “no mushrooms, likes salmon” must be parsed from free text (`pref*` + `foodAvoids`) or you add structured chips later. Do not assume arrays. Deep-link to Meals → Food prefs (existing chip) is enough for Edit.

---

## 14.5 Pantry staples

Global static list, not per-client. One-tap items with macros.

- `src/content/pantry.js`: 51 items `{ cat: "Pantry", group, name, desc, cal, p, c, f, serves: 1 }`.
- Groups: bars, dairy, bread, snacks, protein, fruit, fats.
- No `ingredients[]`. Match kitchen chips against `name` + `desc` (brand/product + serving).
- `recipeToPlanMeal` turns a pantry item into grocery as `[{ amount: desc, item: name }]`.

Staples row in From my kitchen can seed from this list + prefs. Toggles are new client state (`client.kitchen.staples`); the catalog stays Callie’s global sheet.

---

## 14.6 My meals ingredients

**Do not treat ingredients as reliable.** Bank-first matching in 9.3 will often fail on My meals.

- Table `custom_meals`: `ingredients text` optional (newline note), plus `slot`.
- Prod (read-only count): **96 of 1,125 rows** have non-empty ingredients (~8.5%), across 62 profiles. There is no 16-row seed in the repo.
- Paths that skip ingredients: Today “Also save to My meals”, edit-entry save (macros only). Recipe creator always writes them. AI save only if `recipeNoteFromMeal` is non-empty.
- Callie’s **bank** (`RECIPES` + `RECIPE_DETAILS`) does have structured `{item, amount}[]` via `withRecipeDetail()`. Prefer bank + pantry for 9.3 overlap. Use My meals when `ingredients` is present; otherwise match on name only.

**Slice B flywheel:** Save to My meals from `decide_ai` **must** write ingredients + steps so the next open is bank-first. That is how AI usage falls.

---

## 14.7 Log history access

Yes, cheap, already on the client. No extra aggregate.

- `loadClientState` loads **28 days** into `mealHistoryByDate` (grouped `{ date: entries[] }`).
- `db.loadMealLogsHistory(days)` for 30 if you need one more day (`start = today - (days-1)`).
- Entry: `{ id, date, name, cal, p, c, f, via, slot, source }`.
- Compute `logCount30d`, `usualSlot`, `lastLogged`, `mealShares` **client-side** from `mealHistoryByDate`. No server rollup exists.
- Slot may be null on older rows; `groupEntriesBySlot` only time-guesses for **today**. For shares, skip null-slot rows or attribute by time of `created_at` if you add it (not on the mapped row today — only `date`).

---

## 14.8 Slot inference

Reuse `src/utils/mealSlots.js` `guessSlotFromTime` / `resolveLogSlot`. Do not invent new cutoffs.

- Before 10:30 → breakfast
- 10:30–14:00 → lunch
- 14:00–17:00 → snack
- After 17:00 → dinner

Today’s log grouping uses the same functions. Selector default = next **unlogged** slot at or after `guessSlotFromTime()`, not raw time if lunch is already logged at 12:40.

**Brief vs code:** the 12:40 lunch default matches. The 14:00–17:00 **snack** window means a 3pm open defaults to snack, not dinner. Keep that unless Callie wants dinner to start earlier for this sheet.

---

## 14.9 Vision path

Menu snap = `/api/meal-idea` `eating_out` (not `/api/estimate`). Same OpenRouter Gemini flash-lite vision.

Fridge photo **cannot** use it as-is. Modes are only `describe` | `options` | `eating_out`. Plate snap (`/api/estimate` `type: "photo"`) is macro estimation, wrong prompt.

**Slice C:** new mode (e.g. `fridge`) on the same endpoint: same `photoPayload` + multimodal path, new prompt that returns candidate chip names. Confirmation UI (`Looks right`) is new. Do not let the client send a raw prompt.

---

## 14.10 Session storage

No existing date-keyed `sessionStorage` for UI. Quiz/attribution keys are funnel-only. Week plan / grocery use `localStorage` keyed by week.

**Do this:** `sessionStorage` key `${dateKey}:${slot}` as the brief says. New pattern, fine. Clear on log, date change, or dismiss-after-log. Do not use `localStorage` or it will survive overnight and look like a nag.

---

## 14.11 Component extraction

Most pieces are already standalone. Extract only the camera/library picker.

Already files: `SlotChips`, `MealRecipeCard`, `AiMealPreview`, `LoggableMealRow`, `EatingOutMenuFlow`, `RecipeCreator`, `MyMealsAddSheet`, `FoodPrefsEditor`, `MealSlotFilterBar` (330).

**Needs extracting:** hidden `<input type="file">` + camera/library is duplicated in `MealLogCard` (plate) and `EatingOutMenuFlow` (menu). Pull a small `PhotoPicker` for kitchen + eating-out photos.

**Do not gut WeekPlanner.** Compose `DecideSheet` from the files above. Planner Add-meal sheet stays. EatingOutMenuFlow can stay the 5-pick planner/Today Menu UI; Decide eating-out is a thinner 3-card render unless you add a `maxPicks` prop.

Portion stepper: `src/utils/servings.jsx` `ServingStepper` / `scaleMealForLog` already exist. Decide detail wants 0.5 / 0.75 / 1 / 1.5 / 2 — check `snapServings` allows 0.75.

---

## 14.12 330 timing

**Branch Slice A from `cursor/meals-fits-remaining-9347` now.** `mealFitsRemaining` does not exist on `main`.

Signature (do not change):

```js
mealFitsRemaining(meal, remaining)  // remaining = { cal, p, c, f }
```

Missing `remaining` → `true`. Slack: `{ cal: 40, p: 8, c: 15, f: 8 }`. Also exported: `filterMealsByRemaining`, `formatRoomLeft`, `mealMacros`, `remainingAfterMeal`, `roomLeftFromTotals`.

Slice A passes the **slot budget** as `remaining`. That is allowed: same 2-arg contract, different numbers. Do not add a third argument. Do not edit 330 UI.

If 330 merges first, rebase onto `main`. No signature change expected.

---

## 14.13 AI budget

- **Model:** `google/gemini-3.1-flash-lite` (cheap, vision-capable). Env override `MEAL_PLAN_MODEL`.
- `/api/meal-idea` (all modes): **20 calls / user / day** (`estimate_calls` `type='meal_idea'`). Admin unlimited. 429 + `retry_after_seconds: 86400`.
- No dollar accounting in repo. Token caps: options 8000, eating_out 10000.
- Reuse this daily cap for the 3 re-ask cap **and** count generate + re-ask + fridge vision against it. 20/day is enough for ~6 full kitchen/out opens. Surface the cap with the brief’s “Want to tell me what’s in the fridge / Browse everything” copy, not a raw 429.

---

## Extra flags (will block Slice A if ignored)

- `via: decide_bank | decide_ai | decide_out`: `meal_logs.via` is unconstrained `text` (comment lists older values). No check-constraint migration required, but `mapMealRows` / `VIA_LABEL` in `MealLogCard` need the new labels or rows show blank provenance.
- `client.kitchen` / `client.mealShares`: no columns today. Store client-side (`localStorage` per profile) for Slice A shares; kitchen waits for Slice B. Or add `profiles.kitchen` / `profiles.meal_shares` jsonb if you want cross-device.
- `decideMeta` on log rows: no column. Put it in an existing jsonb if one exists, or skip until a migration. Do not stuff it into `name`.
- Greyed pencilled row: Today log is `meal_logs` only. Pencil is a **plan** meal. Render plan meals that are not yet logged (match name+slot or id) as the grey row. Do not insert a fake `meal_logs` row for a pencil.
- Hidden without ranges: same guard as 330 (`macros` + `roomLeftFromTotals`). Sheet only on `isTodayIso(mealLogDate)`.

---

## Section 15 (Callie) — not answered here

Copy, knows-you comfort, default shares `.24 / .30 / .38 / .08`, under-protein kitchen meals, `addOne` list, Get/Skip/Ask substitutions. Those block A/B/D as the brief says. Recommend shipping Slice A with the brief’s template strings behind a `CALLIE_VOICE` constant so she can edit strings in one file.
