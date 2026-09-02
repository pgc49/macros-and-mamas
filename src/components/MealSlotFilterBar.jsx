import { T, F } from "../theme/tokens";
import { MealSearchInput } from "./ui";

function FilterChip({ active, onClick, children, role = "option" }) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role === "button" ? active : undefined}
      aria-selected={role === "option" ? active : undefined}
      onClick={onClick}
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
      {children}
    </button>
  );
}

/**
 * Search field + funnel filter used on Today → My plan and Meals.
 * Slot chips stay hidden until she opens the filter (or a slot is active).
 * Optional remaining-macros chip is always visible — it composes with the slot.
 */
export const FITS_REMAINING_LABEL = "Fits remaining macros";

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
  fitsActive = false,
  onFitsChange,
  fitsLabel = FITS_REMAINING_LABEL,
}) {
  const slotFiltering = Boolean(value && value !== allValue);
  const filtering = slotFiltering || Boolean(fitsActive);
  const filterBits = [slotFiltering ? value : null, fitsActive ? fitsLabel : null].filter(Boolean);
  const filterAria = filterBits.length ? `Filter meals · ${filterBits.join(" · ")}` : "Filter meals";
  const showFits = typeof onFitsChange === "function";

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
          aria-label={filterAria}
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
      {showFits && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <FilterChip
            role="button"
            active={Boolean(fitsActive)}
            onClick={() => onFitsChange(!fitsActive)}
          >
            {fitsLabel}
          </FilterChip>
        </div>
      )}
      {(open || slotFiltering) && (
        <div
          role="listbox"
          aria-label="Filter by meal"
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}
        >
          <FilterChip
            active={!slotFiltering}
            onClick={() => {
              onChange?.(allValue);
              onOpenChange?.(false);
            }}
          >
            {allLabel}
          </FilterChip>
          {filters.map((c) => {
            const active = value === c;
            return (
              <FilterChip
                key={c}
                active={active}
                onClick={() => {
                  onChange?.(active ? allValue : c);
                }}
              >
                {c}
              </FilterChip>
            );
          })}
        </div>
      )}
    </div>
  );
}
