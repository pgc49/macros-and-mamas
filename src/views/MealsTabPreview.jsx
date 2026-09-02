import { useState } from "react";
import { ClientApp } from "./ClientApp";
import { mergeSavedCustomMeal } from "../utils/customMeals";

const noop = () => {};
const noopAsync = async () => true;

/** Local-only preview of Meals tab chips + search filter. */
export function MealsTabPreview() {
  const [mealFilter, setMealFilter] = useState("Decide");
  const [tab, setTab] = useState("meals");
  const [customMeals, setCustomMeals] = useState([
    { id: "c1", name: "Turkey and Bacon", cal: 400, p: 40, c: 10, f: 18 },
    { id: "c2", name: "Yogurt bowl", cal: 280, p: 28, c: 30, f: 6, slot: "breakfast" },
    { id: "c3", name: "Steak Tacos", cal: 480, p: 38, c: 36, f: 18, slot: "lunch" },
  ]);

  return (
    <ClientApp
      tab={tab}
      setTab={setTab}
      profile={{ name: "Pat" }}
      macros={{ protein: 120, carbs: 150, fat: 50, cal: 1700 }}
      totals={{ cal: 1400, p: 90, c: 120, f: 45 }}
      waterOz={80}
      estimateBusy={false}
      estimate={null}
      analyzePhoto={noop}
      analyzeText={noop}
      confirmEstimate={noopAsync}
      discardEstimate={noop}
      logManualMeal={noopAsync}
      logRecipe={noopAsync}
      todayLog={{ date: "2026-08-30", entries: [] }}
      deleteMealEntry={noop}
      updateMealEntry={noop}
      mealLogDate="2026-08-30"
      mealLogWeekStart="2026-08-24"
      mealLogsByDate={{}}
      selectMealLogDate={noop}
      changeMealWeek={noop}
      waterLogsByDate={{}}
      waterBusy={false}
      onAddWater={noop}
      onUndoWater={noop}
      onChangeBottleOz={noop}
      viewWk={1}
      setViewWk={noop}
      curWk={1}
      editPast={false}
      setEditPast={noop}
      checksByWeek={{}}
      toggleCheck={noop}
      adherenceFor={() => ({})}
      progWeekNum={1}
      earliestWk="2026-08-24"
      weighins={[]}
      logWeighin={noop}
      deleteWeighin={noop}
      weeklyRate={0}
      trends={{ locked: true, items: [] }}
      macroHistory={[]}
      mealFilter={mealFilter}
      setMealFilter={setMealFilter}
      customMeals={customMeals}
      onSaveCustomMeal={async (meal, opts = {}) => {
        const saved = opts.slotOnly
          ? { ...customMeals.find((m) => m.id === meal.id), slot: meal.slot }
          : { ...meal, id: meal.id || `c-${meal.name}` };
        setCustomMeals((list) => mergeSavedCustomMeal(list, saved, opts));
        return saved;
      }}
      weekPlanDays={[]}
    />
  );
}
