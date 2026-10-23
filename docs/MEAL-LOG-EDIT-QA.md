# Meal log edits, servings, Snap, and coach writes

Answers from the current Macros and Mamas codebase (researched 4 Sep 2026). No product changes in this pass.

**Note for Claude:** PR #330 (filter meals that fit remaining macros) is already live. Today’s My plan picker and the Meals tab both have a “fits remaining” toggle that uses `filterMealsByRemaining` in `src/utils/eatingOutImpact.js`. Do not rebuild that filter.

---

## 1. What an edit writes

**Same `meal_logs` row, updated in place.** There is no delete-and-insert, no new id.

`db.updateMealLog(id, patch)` does:

```
.update({ name, cal, p, c, f, via?, source?, slot? })
.eq("profile_id", uid)
.eq("id", id)
```

Sources: `src/db/db.js` (`updateMealLog`), `src/App.jsx` (`updateMealEntry`).

Servings, macros, slot, and “Update this meal” (after she taps Save) all go through that path. “Update this meal” first mutates the **edit draft only**; the row is written when she taps Save.

### Does `via` survive?

Usually yes. Save sends `via: nextVia`:

- If she only changes servings or slot: `via` stays whatever was on the row (`recipe`, `custom`, `manual`, `photo`, …).
- If she hand-edits name or a macro **and** the old `via` is AI (`photo` | `describe` | `menu`): `via` becomes `"adjusted"`.
- If she runs “Update this meal”: the draft’s `via` is set to `"photo"` (if she attached a file) or `"describe"` (note only). Save then writes that, so a bank/`recipe` row **loses** `via: "recipe"` unless she cancels.

`updateMealLog` only touches `via` / `source` when the patch includes `via`. A slot-only patch that omitted `via` would leave it alone — but the edit form always sends `via`.

`meal_logs` has no `servings`, `recipe_id`, or `based_on` column. The only “bank link” on a logged row is the name string plus `via`.

---

## 2. “Update this meal”

**Endpoint:** `/api/estimate` (`CONFIG.ESTIMATE_ENDPOINT`), not `/api/meal-idea`.

`estimateMealRefine` in `src/App.jsx` builds a note that includes the current name + macros, then:

- photos → `postEstimate({ type: "photo", images, description })`
- note only → `postEstimate({ type: "text", description })`

The model is told: treat new photos as extras / portion context on the **already logged** meal; return one **new full meal total**, not a delta. So it starts from the current macros as text context, then **re-estimates from scratch** as a single plate. It does not patch P/C/F additively in code.

UI: `LogMealRefine` inside the edit form (`src/components/LogMealRefine.jsx`). Success updates the draft (name, macros, `via`, servings reset to 1×). The DB row changes only on Save.

### Coach-logged bank card

A bank / plan log is `via: "recipe"` and a name. There is **no foreign key** back to `RECIPES` or `CALLIE_RECIPES`.

If she (or a coach flow) uses “Update this meal”:

- draft `via` becomes `photo` or `describe`
- name may change to whatever `/api/estimate` returns
- Save writes those macros in place

The bank link is gone. Exact bank macros are not preserved. Do not put “Update this meal” on a coach-logged bank card if you need `via: "recipe"` and the bank name to survive. Servings stepper + hand macros are safe; refine is not.

---

## 3. Servings stepper — what 1× means

The stepper **does not store a servings column.**

On first log (bank / My meals / planner):

- `scaleMealForLog(meal, qty)` multiplies cal/P/C/F by qty
- name becomes `Protein oatmeal · 1.5×` when qty ≠ 1
- `servingsLogged` is only in memory; it is **not** written to `meal_logs`

So a coach 1.5× bowl should be stored as **flattened macros at what the stepper treats as 1×**, with the `· 1.5×` suffix on the name. There is no “1.5 servings against bank 1×” row.

On edit, `startEdit` does:

```
base = current saved cal/p/c/f
editServings = 1
```

Hint copy: “Scales this log from what’s currently saved as 1×”.

If the coach already logged 1.5× (macros already ×1.5, name `… · 1.5×`):

- opening edit treats **those scaled numbers as 1×**
- stepping to 2× doubles the 1.5× plate (3× the bank), not 2× the bank
- Save to My meals uses `draft.base` (the 1× of *this edit session*), i.e. the already-flattened 1.5× plate, under the stripped name

If you need true bank 1× + a servings multiplier, you would have to add a column. Today the stepper expects flattened macros.

---

## 4. Save to My meals on the edit form

Edit-form checkbox calls `onSaveCustomMeal` with **name + 1× macros only**:

- `name` = `baseName` (serving suffix stripped)
- `cal/p/c/f` = `draft.base` (the 1× of this edit session)
- **no** `ingredients`, **no** `steps`, **no** `serves`, **no** `slot`

That is the thin path.

`db.saveCustomMeal` already accepts more fields on the **same function**:

| Field | `custom_meals` today |
| --- | --- |
| name, cal, p, c, f | required; upsert on `(profile_id, name)` |
| serves | optional numeric; per-serving macros stay in cal/p/c/f |
| ingredients | optional **text** (plain note / newline list), max 4000 |
| slot | optional |
| steps | **does not exist** |

Recipe creator already passes `serves` + `ingredients` (items joined with `\n`) through the same `saveCustomMeal`. Menu “Save to My meals” can pass a short `ingredients` note via `recipeNoteFromMeal`.

**For the coach:** use the same `db.saveCustomMeal` / `saveCustomMeal` in `App.jsx`. Pass `ingredients` (and `serves` / `slot` if you have them). Do not add a second write function.

If the coach needs real **steps** (or structured `{item, amount}[]`), that is a **schema change**. `custom_meals.ingredients` is a text blob, not the planner’s JSON ingredient/steps arrays. `RecipeCreator` does not store steps either.

---

## 5. Slot chips after logging

Slot chips live **inside the edit form**, not on the collapsed row. Tap the row → chips → Save.

Save writes `slot` on the **same** `meal_logs` row. Then `syncEntryIntoWeek` replaces that entry in `todayLog` / `mealLogsByDate` / `mealHistoryByDate`. The day’s log regroups with `groupEntriesBySlot`.

**What does not fire:**

- no push / email / notify
- no `client_week_plans` update
- no plan-matching or “already logged” hide
- totals / range bars do not depend on slot (they sum all entries for the day)

### Grey pencilled row

**Not in the current Today log.** The log only renders real `meal_logs` rows. Planned meals show in the My plan **picker** (`LoggableMealRow`), and that list is **not** filtered by “already logged name + slot.”

There is no shipped “grey pencilled plan row that hides on name + slot match.” If Claude is designing that overlay: a slot move would un-hide the old slot’s ghost and hide the new slot’s ghost, because match is name **plus** slot. Today a slot move only changes which heading the logged row sits under.

---

## 6. Snap tile: Open camera / Photo library / Menu

Two different endpoints.

| Control | What it does | Endpoint | Logged `via` |
| --- | --- | --- | --- |
| Open camera / Photo library | Plate photo → estimate review → confirm | `/api/estimate` `type: "photo"` | `photo` (or `adjusted` if she tweaks before save) |
| Menu | `EatingOutMenuFlow` — menu photos + caption → up to 5 ranked picks | `/api/meal-idea` `mode: "eating_out"` | **`menu`** |

Yes: Menu is the same `eating_out` call the planner uses (`onMealIdea`). Picking “I ordered this” goes through `pickMenuMeal` → `onManualLog` with `via: "menu"`.

Opening Menu clears any staged plate photos so the two paths do not mix.

---

## 7. `todayLog.entries` → totals and range bars

No custom event. No Realtime on `meal_logs`.

In `App.jsx`:

```
totals = useMemo(() => todayLog.entries.reduce(sum cal/p/c/f), [todayLog])
```

Those `totals` feed Today’s `RangeBand`s. `MealLogCard` also re-sums `todayLog.entries` for its footer chips and the “fits remaining” filter (PR #330).

After insert / update / delete, `syncEntryIntoWeek(date, updater)` patches three React maps in one shot:

1. `mealLogsByDate[date]`
2. `mealHistoryByDate[date]`
3. `todayLog.entries` **only if** `todayLog.date === date`

`appendMealEntry` → `db.addMealLog` then `syncEntryIntoWeek(..., list => [...list, row])`.  
`updateMealEntry` → `db.updateMealLog` then replace by `id`.  
`deleteMealEntry` → delete then filter by `id`.

Selecting another day sets `todayLog` to that day’s cached list (`applyDayFromCache`), so the top range bars follow the **selected log date**, not always calendar today.

### What a coach-originated write must do

If the write goes through the mama’s open SPA (`appendMealEntry` / `updateMealEntry`): **insert/update the row is enough.** Totals and bars recompute from the patched `todayLog`. Do not fire an extra event.

If the write is **server-only** (service role, admin function, bot) and the mama already has the app open:

- `meal_logs` is not on the Realtime publication
- her `todayLog` will stay stale until she changes week/day or reloads
- you would need a refetch (`loadMealLogsWeek` + `applyDayFromCache`) or to add Realtime on `meal_logs`

Also: `syncEntryIntoWeek` no-ops `todayLog` when `todayLog.date !==` the written date. A coach logging “today” while she is viewing yesterday will update the week map but not the bars she is looking at until she switches to that day.

---

## Quick coach-write checklist

1. Insert/update the existing `meal_logs` row (do not replace).
2. Flatten servings into cal/p/c/f; put `· 1.5×` on the name if not 1×. Do not invent a servings column.
3. Set `via: "recipe"` for bank/plan exact macros; `custom` for My meals; never run “Update this meal” if you must keep the bank link.
4. Set `slot` or the row lands under a time-of-day guess / Uncategorized.
5. Save-to-My-meals with ingredients: same `saveCustomMeal({ name, cal, p, c, f, serves, ingredients, slot })`. No `steps` column today.
6. If the mama’s client is not the writer, plan a refetch — the bars will not move on their own.
