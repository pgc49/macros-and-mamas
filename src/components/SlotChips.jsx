import { T, F } from "../theme/tokens";
import { MEAL_SLOTS, SLOT_CHIP } from "../utils/mealSlots";

/** Breakfast / Lunch / Dinner / Snack picker — shared by Today log + Add rows. */
export function SlotChips({ value, onChange, compact = false }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 5 : 6 }}>
      {MEAL_SLOTS.map((s) => {
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange?.(s);
            }}
            style={{
              fontFamily: F,
              fontSize: compact ? 11 : 12,
              fontWeight: 700,
              padding: compact ? "4px 9px" : "5px 11px",
              borderRadius: 999,
              border: `1.5px solid ${active ? T.accent : T.border}`,
              background: active ? T.accentSoft : "#fff",
              color: active ? T.accentDeep : T.inkSoft,
              cursor: "pointer",
            }}
          >
            {SLOT_CHIP[s]}
          </button>
        );
      })}
    </div>
  );
}
