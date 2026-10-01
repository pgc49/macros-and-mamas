import { useState } from "react";
import { ClientApp } from "./ClientApp";

const noop = () => {};
const noopAsync = async () => true;

/** Local-only preview of Meals tab chips + search filter. */
export function MealsTabPreview() {
  const [mealFilter, setMealFilter] = useState("All meals");
  const [tab, setTab] = useState("meals");
  const [logFlash, setLogFlash] = useState("");

  const logRecipe = async (recipe) => {
    const name = recipe?.name || "meal";
    setLogFlash(`Added ${name} to Today`);
    window.setTimeout(() => setLogFlash(""), 4000);
    return true;
  };

  return (
    <ClientApp
      tab={tab}
      setTab={setTab}
      profile={{ name: "Pat", homescreenTipDismissedAt: "2026-08-01T00:00:00Z", cohort_label: "2026-07" }}
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
      logRecipe={logRecipe}
      logFlash={logFlash}
      todayLog={{ date: "2026-08-30", entries: [] }}
      deleteMealEntry={noopAsync}
      updateMealEntry={noopAsync}
      mealLogDate="2026-08-30"
      mealLogWeekStart="2026-08-24"
      mealLogsByDate={{}}
      selectMealLogDate={noop}
      changeMealWeek={noop}
      waterLogsByDate={{}}
      waterBusy={false}
      onAddWater={noopAsync}
      onUndoWater={noopAsync}
      onChangeBottleOz={noop}
      viewWk="2026-08-24"
      setViewWk={noop}
      curWk="2026-08-24"
      editPast={false}
      setEditPast={noop}
      checksByWeek={{}}
      toggleCheck={noop}
      goalItems={[]}
      adherenceFor={() => 0}
      progWeekNum={() => 1}
      earliestWk="2026-08-24"
      weighins={[]}
      logWeighin={noopAsync}
      deleteWeighin={noopAsync}
      weeklyRate={0}
      trends={{ locked: true, items: [] }}
      macroHistory={[]}
      mealFilter={mealFilter}
      setMealFilter={setMealFilter}
      customMeals={[
        { id: "c1", name: "Turkey and Bacon", cal: 400, p: 40, c: 10, f: 18 },
        { id: "c2", name: "Yogurt bowl", cal: 280, p: 28, c: 30, f: 6, slot: "breakfast" },
      ]}
      weekPlanDays={[
        {
          day: "Mon",
          meals: [
            { id: "p1", name: "Protein oatmeal", cal: 310, p: 30, c: 40, f: 4, slot: "breakfast" },
          ],
        },
      ]}
      weekPlanWeekStart="2026-08-24"
      onWeekPlanChange={noop}
      onChangeWeekPlanWeek={noop}
    />
  );
}
