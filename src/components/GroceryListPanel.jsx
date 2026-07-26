import { useEffect, useMemo, useState } from "react";
import { T, F } from "../theme/tokens";
import { Btn } from "./ui";
import { safeBuildGroceryList, formatGroceryListText } from "../utils/groceryList";
import { copyText } from "../utils/clipboard";

function groceryStateKey(weekStart) {
  return `mm_grocery_${weekStart || "week"}`;
}

function loadGroceryState(weekStart) {
  try {
    const raw = localStorage.getItem(groceryStateKey(weekStart));
    if (!raw) return { checked: {}, hidden: {} };
    const parsed = JSON.parse(raw);
    return {
      checked: parsed.checked && typeof parsed.checked === "object" ? parsed.checked : {},
      hidden: parsed.hidden && typeof parsed.hidden === "object" ? parsed.hidden : {},
    };
  } catch {
    return { checked: {}, hidden: {} };
  }
}

function saveGroceryState(weekStart, state) {
  try {
    localStorage.setItem(groceryStateKey(weekStart), JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

/**
 * Grocery list body — buy quantities, recipe names, check off / have-it.
 */
export function GroceryListBody({ weekDays, weekStart }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(() => loadGroceryState(weekStart).checked);
  const [hidden, setHidden] = useState(() => loadGroceryState(weekStart).hidden);

  const list = useMemo(() => safeBuildGroceryList(weekDays || []), [weekDays]);

  // Reload persisted state when the planner week changes
  useEffect(() => {
    const s = loadGroceryState(weekStart);
    setChecked(s.checked);
    setHidden(s.hidden);
  }, [weekStart]);

  useEffect(() => {
    saveGroceryState(weekStart, { checked, hidden });
  }, [weekStart, checked, hidden]);

  const visibleSections = useMemo(() => {
    return list.sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((row) => !hidden[row.key]),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [list.sections, hidden]);

  const hiddenCount = useMemo(
    () => list.sections.reduce((n, sec) => n + sec.items.filter((r) => hidden[r.key]).length, 0),
    [list.sections, hidden],
  );

  const checkedCount = useMemo(
    () => list.sections.reduce((n, sec) => n + sec.items.filter((r) => checked[r.key] && !hidden[r.key]).length, 0),
    [list.sections, checked, hidden],
  );

  const toggleChecked = (key) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const markHaveIt = (key) => {
    setHidden((prev) => ({ ...prev, [key]: true }));
    setChecked((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const restoreHidden = () => {
    setHidden({});
  };

  const clearChecks = () => {
    setChecked({});
  };

  const onCopy = async () => {
    setError("");
    try {
      // Copy only still-needed (not hidden, not checked) items
      const filtered = {
        ...list,
        sections: list.sections
          .map((sec) => ({
            ...sec,
            items: sec.items.filter((row) => !hidden[row.key] && !checked[row.key]),
          }))
          .filter((sec) => sec.items.length > 0),
      };
      const text = formatGroceryListText(filtered, {
        title: "Macros and Mamas — grocery list",
      });
      await copyText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("grocery copy failed", e);
      setError("Couldn’t copy — select the list and copy manually.");
    }
  };

  if (!list.lineCount) {
    return (
      <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
        No structured ingredients on these meals yet — macros still track on the board.
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45, margin: "0 0 12px" }}>
        Buy sizes for the store — recipes stay exact on the board. Tap to cross off while shopping;
        use Have it if it’s already in your kitchen.
      </p>

      {visibleSections.map((sec) => (
        <div key={sec.aisle} style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: T.accentDeep,
              marginBottom: 6,
            }}
          >
            {sec.aisle}
          </div>
          {sec.items.map((row) => {
            const done = !!checked[row.key];
            return (
              <div
                key={row.key}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "8px 0",
                  borderBottom: `1px solid ${T.border}`,
                  opacity: done ? 0.55 : 1,
                }}
              >
                <button
                  type="button"
                  aria-label={done ? `Uncheck ${row.item}` : `Check off ${row.item}`}
                  onClick={() => toggleChecked(row.key)}
                  style={{
                    width: 22,
                    height: 22,
                    marginTop: 2,
                    flexShrink: 0,
                    borderRadius: 6,
                    border: `1.5px solid ${done ? T.accent : T.border}`,
                    background: done ? T.accentSoft : "#fff",
                    cursor: "pointer",
                    color: T.accentDeep,
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1,
                    fontFamily: F,
                    padding: 0,
                  }}
                >
                  {done ? "✓" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => toggleChecked(row.key)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    border: "none",
                    background: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontFamily: F,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: T.ink,
                      textDecoration: done ? "line-through" : "none",
                    }}
                  >
                    {row.item}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.accentDeep, fontWeight: 700, marginTop: 2 }}>
                    Buy {row.buy || "—"}
                    {row.needNote ? (
                      <span style={{ fontWeight: 400, color: T.inkSoft }}> · {row.needNote}</span>
                    ) : null}
                    {row.staple ? (
                      <span style={{ fontWeight: 400, color: T.inkSoft }}> · usually on hand</span>
                    ) : null}
                  </div>
                  {(row.recipes || []).length > 0 && (
                    <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 3, lineHeight: 1.4 }}>
                      For: {(row.recipes || []).join(" · ")}
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => markHaveIt(row.key)}
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    border: "none",
                    background: "none",
                    color: T.inkSoft,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: F,
                    textDecoration: "underline",
                    padding: "2px 0",
                  }}
                >
                  Have it
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {!visibleSections.length && (
        <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 12, lineHeight: 1.5 }}>
          Everything’s crossed off or marked as already at home. Nice shopping.
        </div>
      )}

      {list.notes?.length > 0 && (
        <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45, marginBottom: 12 }}>
          {list.notes.map((n) => (
            <div key={n} style={{ marginBottom: 4 }}>• {n}</div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Btn small onClick={onCopy}>
          {copied ? "Copied" : "Copy list"}
        </Btn>
        {checkedCount > 0 && (
          <button
            type="button"
            onClick={clearChecks}
            style={{
              border: "none",
              background: "none",
              fontSize: 12.5,
              color: T.inkSoft,
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: F,
            }}
          >
            Clear checks
          </button>
        )}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={restoreHidden}
            style={{
              border: "none",
              background: "none",
              fontSize: 12.5,
              color: T.inkSoft,
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: F,
            }}
          >
            Show {hiddenCount} have-it {hiddenCount === 1 ? "item" : "items"}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8 }}>
        Paste into Notes or text your partner
      </div>
      {error && (
        <div style={{ fontSize: 12.5, color: T.amber, marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
}

/** @deprecated Prefer Ready-to-shop + GroceryListBody. Kept for any leftover imports. */
export function GroceryListPanel({
  weekDays,
  weekStart,
  emptyHint = "Add meals to your plan — grocery builds from what you commit.",
  open: openControlled,
  onOpenChange,
  ctaLabel = "View grocery list",
}) {
  const [openLocal, setOpenLocal] = useState(false);
  const controlled = typeof openControlled === "boolean";
  const open = controlled ? openControlled : openLocal;
  const setOpen = (next) => {
    const value = typeof next === "function" ? next(open) : next;
    if (!controlled) setOpenLocal(value);
    onOpenChange?.(value);
  };

  const plannedMeals = useMemo(
    () => (weekDays || []).reduce((n, d) => n + (d.meals?.length || 0), 0),
    [weekDays],
  );
  const list = useMemo(() => safeBuildGroceryList(weekDays || []), [weekDays]);

  useEffect(() => {
    if (plannedMeals === 0 && open) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannedMeals]);

  if (!weekDays?.length) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => plannedMeals > 0 && setOpen(!open)}
        disabled={plannedMeals === 0}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 14,
          border: `1.5px solid ${open ? T.accent : T.border}`,
          background: open ? T.accentSoft : "#fff",
          cursor: plannedMeals ? "pointer" : "default",
          fontFamily: F,
          textAlign: "left",
          opacity: plannedMeals ? 1 : 0.85,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: open ? T.accentDeep : T.ink }}>
            {ctaLabel}
          </div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
            {plannedMeals === 0
              ? emptyHint
              : `${list.lineCount} items · ${plannedMeals} meals`}
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep }}>
          {plannedMeals === 0 ? "—" : open ? "Hide ▴" : "Open ▾"}
        </span>
      </button>
      {open && plannedMeals > 0 && (
        <div style={{ marginTop: 10 }}>
          <GroceryListBody weekDays={weekDays} weekStart={weekStart} />
        </div>
      )}
    </div>
  );
}
