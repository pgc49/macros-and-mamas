import { useMemo, useState } from "react";
import { Fonts } from "../theme/Fonts";
import { T, F, FD } from "../theme/tokens";
import { MealLogCard } from "../components/MealLogCard";
import { RECIPES } from "../content/data";
import { addDaysIso, localDateIso, planDayLabel } from "../utils/dates";
import { addMealToDay, customMealToPlanMeal, recipeToPlanMeal, replaceMealById } from "../utils/weekPlan";
import { decidePencilForSlot } from "../utils/decideBudget";
import { namesMatch, stripPortionSuffix } from "../utils/decidePrefs";

const MACROS = { cal: 1750, protein: 145, carbs: 180, fat: 60 };

const CUSTOM = [
  { id: "c1", name: "Leftover chicken bowl", cal: 260, p: 32, c: 22, f: 5, slot: "lunch", ingredients: "5 oz chicken\n½ cup rice" },
  { id: "c2", name: "Greek yogurt bowl", cal: 350, p: 25, c: 49, f: 5, slot: "breakfast" },
];

const PROFILE = {
  diet: "none",
  allergens: [],
  foodAvoids: "cilantro",
  prefL: "chicken salads, leftover bowls",
  prefD: "chicken and rice, salmon",
};

function buildHistory(today) {
  const hist = {};
  for (let i = 1; i <= 8; i += 1) {
    const d = addDaysIso(today, -i);
    hist[d] = [
      { slot: "breakfast", name: "Protein oatmeal", cal: 310, p: 30, c: 40, f: 4 },
      { slot: "lunch", name: "Grilled chicken big salad", cal: 420, p: 59, c: 10, f: 14 },
      { slot: "dinner", name: "Salmon + potatoes", cal: 455, p: 43, c: 32, f: 16 },
    ];
  }
  return hist;
}

function seeds() {
  const breakfast = {
    id: "b1",
    name: "Protein oatmeal + eggs",
    cal: 905,
    p: 64,
    c: 53,
    f: 47,
    slot: "breakfast",
    via: "recipe",
  };
  return {
    lunch: {
      label: "12:40 leftover lunch",
      now: new Date(2026, 8, 2, 12, 40),
      entries: [breakfast],
      planned: [],
    },
    dinner: {
      label: "18:30 last meal · 1.5× room",
      now: new Date(2026, 8, 2, 18, 30),
      entries: [
        { id: "b2", name: "Breakfast plate", cal: 500, p: 35, c: 40, f: 20, slot: "breakfast", via: "manual" },
        { id: "l2", name: "Lunch salad", cal: 500, p: 35, c: 60, f: 20, slot: "lunch", via: "manual" },
      ],
      planned: [],
    },
    pencil: {
      label: "Lunch with dinner pencilled",
      now: new Date(2026, 8, 2, 12, 40),
      entries: [breakfast],
      planned: [{
        id: "d1",
        slot: "dinner",
        via: "decide",
        name: "Pulled chicken tacos",
        cal: 425,
        p: 48,
        c: 38,
        f: 7,
      }],
    },
  };
}

export function DecidePreview() {
  const today = localDateIso();
  const all = useMemo(() => seeds(), []);
  const history = useMemo(() => buildHistory(today), [today]);
  const [seedKey, setSeedKey] = useState("lunch");
  const seed = all[seedKey];
  const [entries, setEntries] = useState(seed.entries);
  const [planned, setPlanned] = useState(seed.planned);
  const [toast, setToast] = useState("");

  const switchSeed = (key) => {
    setSeedKey(key);
    setEntries(all[key].entries);
    setPlanned(all[key].planned);
  };

  const logRecipe = async (recipe) => {
    setEntries((list) => [
      ...list,
      {
        id: `e_${Date.now()}`,
        name: recipe.name,
        cal: recipe.cal,
        p: recipe.p,
        c: recipe.c,
        f: recipe.f,
        via: recipe.via || "recipe",
        slot: recipe.slot || "lunch",
      },
    ]);
    setToast(`Logged to ${recipe.slot || "today"}`);
    window.setTimeout(() => setToast(""), 2500);
    return true;
  };

  const onPencil = async (meal, slot) => {
    const servings = Number(meal.servings) || 1;
    const base = {
      name: stripPortionSuffix(meal.name),
      cal: (Number(meal.cal) || 0) / servings,
      p: (Number(meal.p) || 0) / servings,
      c: (Number(meal.c) || 0) / servings,
      f: (Number(meal.f) || 0) / servings,
      cat: slot,
    };
    const built = meal.source === "my"
      ? customMealToPlanMeal({ ...meal, ...base }, slot)
      : recipeToPlanMeal({ ...base, name: meal.name }, slot);
    built.via = "decide";
    built.qty = servings;
    built.cal = base.cal;
    built.p = base.p;
    built.c = base.c;
    built.f = base.f;
    setPlanned((list) => {
      const dayKey = planDayLabel(today);
      const days = [{ day: dayKey, meals: list }];
      const existing = decidePencilForSlot(list, slot);
      const nextDays = existing
        ? replaceMealById(days, existing.id, built)
        : addMealToDay(days, dayKey, built);
      const row = nextDays.find((d) => d.day === dayKey);
      return Array.isArray(row?.meals) && row.meals.length ? row.meals : [built];
    });
    return true;
  };

  const onAteIt = async (meal) => {
    if (entries.some((e) => e.slot === meal.slot && namesMatch(e.name, meal.name))) return true;
    return logRecipe({ ...meal, via: "decide_bank" });
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
        Local preview · /dev/decide
      </p>
      <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 22, margin: "0 0 8px", color: T.ink }}>
        Help me decide
      </h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {Object.entries(all).map(([key, s]) => (
          <button
            key={key}
            type="button"
            onClick={() => switchSeed(key)}
            style={{
              fontFamily: F,
              fontWeight: 700,
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 999,
              border: `1.5px solid ${seedKey === key ? T.accent : T.border}`,
              background: seedKey === key ? T.accentSoft : "#fff",
              color: seedKey === key ? T.accentDeep : T.inkSoft,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {toast ? (
        <div style={{
          fontFamily: F,
          fontSize: 13,
          fontWeight: 700,
          color: T.sage,
          background: T.sageSoft,
          borderRadius: 12,
          padding: "8px 12px",
          marginBottom: 10,
        }}
        >
          {toast}
        </div>
      ) : null}
      <MealLogCard
        macros={MACROS}
        recipes={RECIPES}
        customMeals={CUSTOM}
        plannedMeals={planned}
        todayLog={{ date: today, entries }}
        mealLogDate={today}
        profile={PROFILE}
        mealHistoryByDate={history}
        decideNow={seed.now}
        onLogRecipe={logRecipe}
        onPencilPlanMeal={onPencil}
        onAteIt={onAteIt}
      />
    </div>
  );
}
