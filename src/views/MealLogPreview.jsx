import { Fonts } from "../theme/Fonts";
import { T, F, FD } from "../theme/tokens";
import { MealLogCard } from "../components/MealLogCard";
import { RecipeCreator } from "../components/RecipeCreator";

/** Local-only preview of Today → My plan list + slot filter. */
const PREVIEW_CUSTOM = [
  { id: "c1", name: "Pulled Chicken Tacos", cal: 425, p: 48, c: 38, f: 7, ingredients: "5 oz chicken\n3 corn tortillas" },
  { id: "c2", name: "Turkey and Bacon", cal: 410, p: 36, c: 8, f: 22, slot: "dinner" },
  { id: "c3", name: "Greek yogurt bowl", cal: 350, p: 25, c: 49, f: 5 },
  { id: "c4", name: "Egg white scramble", cal: 400, p: 39, c: 25, f: 13, slot: "breakfast" },
  { id: "c5", name: "Salmon salad", cal: 335, p: 39, c: 6, f: 15, slot: "lunch" },
];

const PREVIEW_PLAN = [
  { id: "p1", name: "Protein oatmeal", cal: 310, p: 30, c: 40, f: 4, slot: "breakfast" },
];

export function MealLogPreview() {
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
        My plan list
      </h1>
      <p style={{ fontFamily: F, fontSize: 13, color: T.inkSoft, margin: "0 0 12px", lineHeight: 1.45 }}>
        Compact cards, taller list, and the filter icon next to search.
      </p>
      <MealLogCard
        initialMethod="recipes"
        customMeals={PREVIEW_CUSTOM}
        plannedMeals={PREVIEW_PLAN}
        macros={{ cal: 1800, protein: 130, carbs: 160, fat: 55 }}
        todayLog={{ date: "2026-08-30", entries: [] }}
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
    </div>
  );
}
