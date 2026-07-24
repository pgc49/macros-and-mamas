import { useEffect, useMemo, useState } from "react";
import { T, F } from "../theme/tokens";
import { Btn } from "./ui";
import { buildGroceryList, formatGroceryListText } from "../utils/groceryList";
import { copyText } from "../utils/clipboard";

/**
 * Grocery list body — aisle sections + copy. No meal-source lines (shop-style).
 * Parent owns open/closed chrome (e.g. Ready to shop card).
 */
export function GroceryListBody({ weekDays }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const list = useMemo(() => buildGroceryList(weekDays || []), [weekDays]);

  const onCopy = async () => {
    setError("");
    try {
      const text = formatGroceryListText(list, {
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
      {list.sections.map((sec) => (
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
          {sec.items.map((row) => (
            <div
              key={row.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                padding: "7px 0",
                borderBottom: `1px solid ${T.border}`,
                fontSize: 13.5,
                lineHeight: 1.35,
              }}
            >
              <div style={{ minWidth: 0, color: T.ink, fontWeight: 600 }}>
                {row.item}
                {row.staple ? (
                  <span style={{ fontWeight: 400, color: T.inkSoft, fontSize: 12 }}> · on hand?</span>
                ) : null}
              </div>
              <div
                style={{
                  color: T.inkSoft,
                  textAlign: "right",
                  flexShrink: 0,
                  maxWidth: "45%",
                  fontSize: 12.5,
                }}
              >
                {row.amounts.join("; ") || "—"}
              </div>
            </div>
          ))}
        </div>
      ))}

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
        <span style={{ fontSize: 12.5, color: T.inkSoft }}>
          Paste into Notes or text your partner
        </span>
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
  const list = useMemo(() => buildGroceryList(weekDays || []), [weekDays]);

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
          <GroceryListBody weekDays={weekDays} />
        </div>
      )}
    </div>
  );
}
