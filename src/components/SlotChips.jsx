import { T, F } from "../theme/tokens";
import { MEAL_SLOTS, SLOT_CHIP } from "../utils/mealSlots";

/** Breakfast / Lunch / Dinner / Snack picker — shared by Today log + Add rows. */
export function SlotChips({ value, onChange, compact = false, fill = false }) {
  const tight = compact || fill;
  return (
    <div
      data-slot-chips={fill ? "fill" : compact ? "compact" : "default"}
      style={{
        display: "flex",
        flexWrap: fill ? "nowrap" : "wrap",
        gap: fill ? 4 : tight ? 5 : 6,
        width: fill ? "100%" : undefined,
      }}
    >
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
              fontSize: fill ? 10.5 : compact ? 11 : 12,
              fontWeight: 700,
              padding: fill ? "3px 4px" : compact ? "4px 9px" : "5px 11px",
              lineHeight: 1.2,
              borderRadius: 999,
              border: `1.5px solid ${active ? T.accent : T.border}`,
              background: active ? T.accentSoft : "#fff",
              color: active ? T.accentDeep : T.inkSoft,
              cursor: "pointer",
              flexGrow: fill ? 1 : undefined,
              flexShrink: fill ? 1 : undefined,
              flexBasis: fill ? 0 : undefined,
              minWidth: fill ? 0 : undefined,
              textAlign: "center",
            }}
          >
            {SLOT_CHIP[s]}
          </button>
        );
      })}
    </div>
  );
}
