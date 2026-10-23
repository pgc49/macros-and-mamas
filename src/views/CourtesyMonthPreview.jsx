import { useState } from "react";
import { ClientApp } from "./ClientApp";

const noop = () => {};
const noopAsync = async () => true;

/** Local-only Today screen for August Group during the last days of the 8 weeks. */
export function CourtesyMonthPreview() {
  const [tab, setTab] = useState("today");
  const [mealFilter, setMealFilter] = useState("All meals");

  return (
    <ClientApp
      tab={tab}
      setTab={setTab}
      onMembershipPay={async () => "Stripe checkout would open next. The first charge waits until November 25. This preview does not charge a card."}
      profile={{
        name: "Pat",
        paid: true,
        homescreenTipDismissedAt: "2026-08-01T00:00:00Z",
        cohort_label: "2026-08",
        subscription_status: null,
        tier: "none",
      }}
      macros={{ protein: 120, carbs: 150, fat: 50, cal: 1700 }}
      totals={{ cal: 980, p: 70, c: 90, f: 32 }}
      waterOz={80}
      estimateBusy={false}
      estimate={null}
      analyzePhoto={noop}
      analyzeText={noop}
      confirmEstimate={noopAsync}
      discardEstimate={noop}
      logManualMeal={noopAsync}
      logRecipe={noopAsync}
      todayLog={{ date: "2026-10-23", entries: [] }}
      deleteMealEntry={noopAsync}
      updateMealEntry={noopAsync}
      mealLogDate="2026-10-23"
      mealLogWeekStart="2026-10-19"
      mealLogsByDate={{}}
      selectMealLogDate={noop}
      changeMealWeek={noop}
      waterLogsByDate={{}}
      waterBusy={false}
      onAddWater={noopAsync}
      onUndoWater={noopAsync}
      onChangeBottleOz={noop}
      viewWk="2026-10-19"
      setViewWk={noop}
      curWk="2026-10-19"
      editPast={false}
      setEditPast={noop}
      checksByWeek={{}}
      toggleCheck={noop}
      goalItems={[]}
      adherenceFor={() => 0}
      progWeekNum={() => 8}
      earliestWk="2026-08-31"
      weighins={[]}
      logWeighin={noopAsync}
      deleteWeighin={noopAsync}
      weeklyRate={0}
      trends={{ locked: true, items: [] }}
      macroHistory={[]}
      mealFilter={mealFilter}
      setMealFilter={setMealFilter}
      customMeals={[]}
      userId="mama-preview"
    />
  );
}
