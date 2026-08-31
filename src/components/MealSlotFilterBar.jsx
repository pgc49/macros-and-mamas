import { T, F } from "../theme/tokens";
import { MealSearchInput } from "./ui";

/**
 * Search field + funnel filter used on Today → My plan and Meals.
 * Slot chips stay hidden until she opens the filter (or a slot is active).
 */
export function MealSlotFilterBar({
  query,
  onQueryChange,
  placeholder = "Search meals",
  filters,
  value,
  onChange,
  allValue = "all",
  allLabel = "All",
  open,
  onOpenChange,
}) {
  const filtering = Boolean(value && value !== allValue);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
        <MealSearchInput
          value={query}
          onChange={onQueryChange}
          placeholder={placeholder}
          style={{ flex: 1, marginBottom: 0, minWidth: 0 }}
        />
        <button
          type="button"
          aria-label={filtering ? `Filter meals · ${value}` : "Filter meals"}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => onOpenChange?.(!open)}
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 12,
            border: `1.5px solid ${filtering || open ? T.accent : T.border}`,
            background: filtering || open ? T.accentSoft : "#fff",
            color: filtering || open ? T.accentDeep : T.inkSoft,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            padding: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 6h16l-6.2 7.4V19l-3.6 1.6v-7.2L4 6z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          {filtering && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 7,
                right: 7,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: T.accent,
              }}
            />
          )}
        </button>
      </div>
      {(open || filtering) && (
        <div
          role="listbox"
          aria-label="Filter by meal"
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}
        >
          <button
            type="button"
            role="option"
            aria-selected={!filtering}
            onClick={() => {
              onChange?.(allValue);
              onOpenChange?.(false);
            }}
            style={{
              fontFamily: F,
              fontSize: 11.5,
              fontWeight: 700,
              padding: "5px 10px",
              borderRadius: 999,
              border: `1.5px solid ${!filtering ? T.accent : T.border}`,
              background: !filtering ? T.accentSoft : "#fff",
              color: !filtering ? T.accentDeep : T.inkSoft,
              cursor: "pointer",
            }}
          >
            {allLabel}
          </button>
          {filters.map((c) => {
            const active = value === c;
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange?.(active ? allValue : c);
                }}
                style={{
                  fontFamily: F,
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: `1.5px solid ${active ? T.accent : T.border}`,
                  background: active ? T.accentSoft : "#fff",
                  color: active ? T.accentDeep : T.inkSoft,
                  cursor: "pointer",
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
