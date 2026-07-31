import { useState } from "react";
import { T, F } from "../theme/tokens";
import { Btn } from "./ui";
import { SLOT_LABEL } from "../utils/weekPlan";

function ActionPill({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: F,
        fontSize: 12,
        fontWeight: 700,
        padding: "7px 12px",
        borderRadius: 999,
        border: `1.5px solid ${T.accent}`,
        background: "#fff",
        color: T.accentDeep,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function IngList({ items }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5, color: T.ink }}>
      {items.map((ing, i) => {
        if (typeof ing === "string") return <li key={i}>{ing}</li>;
        const amt = ing?.amount || ing?.qty || "";
        const name = ing?.item || ing?.name || "";
        return <li key={i}>{[amt, name].filter(Boolean).join(" ")}</li>;
      })}
    </ul>
  );
}

/**
 * Preview card for AI meal ideas (slot options or eating-out picks).
 */
export function AiMealPreview({
  meal,
  onAdd,
  eatingOut = false,
  dayImpact = null,
  addLabel = "Add to plan",
  rank = null,
  rankLabel = null,
}) {
  const [open, setOpen] = useState(false);
  const ings = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  const steps = Array.isArray(meal.steps) ? meal.steps : [];
  const impactOk = dayImpact?.fits !== false;
  const showRank = eatingOut && (rank != null || rankLabel || meal.rankLabel);
  return (
    <div
      style={{
        border: `1.5px solid ${T.border}`,
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        background: T.accentSoft,
      }}
    >
      {showRank && (
        <div style={{
          fontSize: 12,
          fontWeight: 800,
          color: rank === 1 ? "#3E5A46" : T.accentDeep,
          marginBottom: 4,
          letterSpacing: 0.2,
        }}
        >
          #{rank || meal.rank || "·"}
          {" · "}
          {rankLabel || meal.rankLabel || "Pick"}
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, color: T.accentDeep, textTransform: "uppercase" }}>
        {SLOT_LABEL[String(meal.slot || "").toLowerCase()] || "Meal"}
        {eatingOut
          ? " · eating out · rough estimate"
          : Number(meal.servings) > 1
            ? ` · batch · serves ${meal.servings}`
            : meal.basedOn
              ? ` · based on ${meal.basedOn}`
              : " · custom AI"}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginTop: 2 }}>{meal.name}</div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
        {meal.cal} cal · P {meal.p}g · C {meal.c}g · F {meal.f}g
      </div>
      {dayImpact && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 10,
            background: impactOk ? "rgba(255,255,255,0.72)" : T.amberSoft,
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: impactOk ? "#3E5A46" : T.amber }}>
            {dayImpact.badge}
          </div>
          <div style={{ fontSize: 11.5, color: T.ink, marginTop: 2 }}>
            {dayImpact.detail}
          </div>
        </div>
      )}
      {meal.desc && (
        <div style={{ fontSize: 12.5, color: T.ink, marginTop: 6, lineHeight: 1.4 }}>{meal.desc}</div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        <Btn small onClick={onAdd}>{addLabel}</Btn>
        {(ings.length > 0 || steps.length > 0) && (
          <ActionPill onClick={() => setOpen((o) => !o)}>
            {open ? "Hide tips" : eatingOut ? "Order tips" : "Show recipe"}
          </ActionPill>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
          {ings.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                {eatingOut ? "As ordered" : "Ingredients · one serving"}
              </div>
              <IngList items={ings} />
            </div>
          )}
          {steps.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                {eatingOut ? "Order tips" : "Steps"}
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5, color: T.ink }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{s}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
