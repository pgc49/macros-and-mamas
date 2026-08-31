import { Fonts } from "../theme/Fonts";
import { T, F, FD } from "../theme/tokens";
import { RECIPES } from "../content/data";
import { MealRecipeCard } from "../components/MealRecipeCard";

/** Local-only preview of the default Meals bank cards. */
export function RecipeBankPreview() {
  const dinners = RECIPES.filter((r) => r.cat === "Dinner");
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
        Recipe bank · Dinner
      </h1>
      <p style={{ fontFamily: F, fontSize: 13, color: T.inkSoft, margin: "0 0 12px", lineHeight: 1.45 }}>
        Default Meals bank cards. Expand a recipe for batch ingredients and steps.
      </p>
      {dinners.map((meal) => (
        <MealRecipeCard key={meal.name} meal={meal} showLog={false} />
      ))}
    </div>
  );
}
