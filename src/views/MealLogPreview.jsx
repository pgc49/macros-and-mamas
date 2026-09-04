import { useState } from "react";
import { Fonts } from "../theme/Fonts";
import { T, F, FD } from "../theme/tokens";
import { MealLogCard } from "../components/MealLogCard";
import { RecipeCreator } from "../components/RecipeCreator";
import { WaterLogCard } from "../components/WaterLogCard";
import { WeighInCard } from "../components/WeighInCard";

/** Local-only preview of Today logging — in-memory saves so QA can click every path. */
const PREVIEW_CUSTOM = [
  { id: "c1", name: "Pulled Chicken Tacos", cal: 425, p: 48, c: 38, f: 7, ingredients: "5 oz chicken\n3 corn tortillas" },
  { id: "c2", name: "Turkey and Bacon", cal: 410, p: 36, c: 8, f: 22, slot: "dinner" },
  { id: "c3", name: "Greek yogurt bowl", cal: 350, p: 25, c: 49, f: 5 },
  { id: "c4", name: "Egg white scramble", cal: 400, p: 39, c: 25, f: 13, slot: "breakfast" },
  { id: "c5", name: "Salmon salad", cal: 335, p: 39, c: 6, f: 15, slot: "lunch" },
];

const PREVIEW_PLAN = [
  { id: "p1", name: "Protein oatmeal", cal: 310, p: 30, c: 40, f: 4, slot: "breakfast" },
  { id: "p2", name: "Big pasta night", cal: 720, p: 28, c: 90, f: 22, slot: "dinner" },
];

const PREVIEW_DATE = "2026-08-30";

export function MealLogPreview() {
  const [entries, setEntries] = useState([
    { id: "seed", name: "Lunch bowl", cal: 1400, p: 90, c: 120, f: 45, via: "manual", slot: "lunch" },
  ]);
  const [customMeals, setCustomMeals] = useState(PREVIEW_CUSTOM);
  const [waterEntries, setWaterEntries] = useState([]);
  const [weighins, setWeighins] = useState([]);
  const [estimate, setEstimate] = useState(null);

  const append = async (entry) => {
    const row = {
      id: `local-${Date.now()}`,
      name: entry.name,
      cal: Number(entry.cal) || 0,
      p: Number(entry.p) || 0,
      c: Number(entry.c) || 0,
      f: Number(entry.f) || 0,
      via: entry.via || "manual",
      slot: entry.slot || "snack",
    };
    setEntries((list) => [...list, row]);
    return true;
  };

  return (
    <div style={{
      maxWidth: 430,
      margin: "0 auto",
      padding: "16px 14px 40px",
      background: T.bg,
      minHeight: "100vh",
      boxSizing: "border-box",
    }}
    >
      <Fonts />
      <p style={{
        fontFamily: F,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: T.inkSoft,
        margin: "0 0 6px",
      }}
      >
        Local preview
      </p>
      <h1 style={{
        fontFamily: FD,
        fontWeight: 400,
        fontSize: 22,
        margin: "0 0 4px",
        color: T.ink,
      }}
      >
        Today log saves
      </h1>
      <p style={{ fontFamily: F, fontSize: 13, color: T.inkSoft, margin: "0 0 12px", lineHeight: 1.45 }}>
        In-memory only. Click every save: Macros, My plan, estimate Save, edit, water, weigh-in.
      </p>
      <button
        type="button"
        onClick={() => setEstimate({
          meal: "Eggs and toast",
          calories: 420,
          protein_g: 28,
          carbs_g: 32,
          fat_g: 18,
          items: ["2 eggs"],
          confidence: "medium",
        })}
        style={{
          fontFamily: F,
          fontSize: 12,
          fontWeight: 700,
          margin: "0 0 12px",
          padding: "8px 12px",
          borderRadius: 999,
          border: `1.5px solid ${T.border}`,
          background: "#fff",
          color: T.ink,
          cursor: "pointer",
        }}
      >
        Load demo estimate
      </button>
      <MealLogCard
        initialMethod="manual"
        customMeals={customMeals}
        plannedMeals={PREVIEW_PLAN}
        macros={{ cal: 1700, protein: 120, carbs: 150, fat: 50 }}
        todayLog={{ date: PREVIEW_DATE, entries }}
        mealLogDate={PREVIEW_DATE}
        estimate={estimate}
        onManualLog={append}
        onLogRecipe={append}
        onConfirmEstimate={async (payload) => {
          const ok = await append({ ...payload, via: "adjusted" });
          if (ok) setEstimate(null);
          return ok;
        }}
        onDiscardEstimate={() => setEstimate(null)}
        onUpdateEntry={async (id, patch) => {
          setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
          return true;
        }}
        onDeleteEntry={async (id) => {
          setEntries((list) => list.filter((e) => e.id !== id));
          return true;
        }}
        onSaveCustomMeal={async (meal) => {
          const saved = { ...meal, id: `c-${Date.now()}` };
          setCustomMeals((list) => [saved, ...list]);
          return saved;
        }}
      />
      <div style={{ marginTop: 20 }}>
        <h2 style={{
          fontFamily: FD,
          fontWeight: 400,
          fontSize: 20,
          margin: "0 0 8px",
          color: T.ink,
        }}
        >
          Save a recipe
        </h2>
        <p style={{ fontFamily: F, fontSize: 13, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.45 }}>
          Pick Breakfast / Lunch / Dinner / Snack before Save to My meals.
        </p>
        <RecipeCreator
          embedded
          defaultSlot="dinner"
          onEstimateRecipe={async () => ({
            meal: "Turkey chili",
            servings: 4,
            calories: 1600,
            protein_g: 160,
            carbs_g: 80,
            fat_g: 48,
            items: ["2 lb turkey", "beans", "tomatoes"],
            confidence: "high",
          })}
          onSaveCustomMeal={async (meal) => meal}
        />
      </div>
      <WaterLogCard
        date={PREVIEW_DATE}
        goalOz={80}
        bottleOz={24}
        entries={waterEntries}
        onAdd={async (oz) => {
          setWaterEntries((list) => [...list, { id: `w-${Date.now()}`, oz }]);
          return true;
        }}
        onUndo={async () => {
          setWaterEntries((list) => list.slice(0, -1));
        }}
      />
      <div style={{ marginTop: 16 }}>
        <WeighInCard
          weighins={weighins}
          onSave={async (w, date) => {
            setWeighins((list) => {
              const without = list.filter((x) => x.date !== date);
              return [...without, { date, w }].sort((a, b) => (a.date < b.date ? -1 : 1));
            });
            return true;
          }}
          onDelete={async (date) => {
            setWeighins((list) => list.filter((x) => x.date !== date));
          }}
        />
      </div>
    </div>
  );
}
