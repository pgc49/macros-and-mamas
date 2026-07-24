import { useEffect, useMemo, useState } from "react";
import { T, F } from "../theme/tokens";
import { Card, Btn } from "./ui";
import { buildGroceryList, formatGroceryListText } from "../utils/groceryList";
import { copyText } from "../utils/clipboard";

/**
 * Grocery list from a committed week plan only.
 * Recalculates live as the plan changes. Supports controlled open.
 */
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

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const plannedMeals = useMemo(
    () => (weekDays || []).reduce((n, d) => n + (d.meals?.length || 0), 0),
    [weekDays],
  );
  const list = useMemo(() => buildGroceryList(weekDays || []), [weekDays]);

  useEffect(() => {
    if (plannedMeals === 0 && open) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only collapse when plan empties
  }, [plannedMeals]);

  const onCopy = async () => {
    setError("");
    try {
      const text = formatGroceryListText(list, {
        title: "Macros and Mamas — my week grocery list",
      });
      await copyText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("grocery copy failed", e);
      setError("Couldn’t copy — select the list and copy manually.");
    }
  };

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
              ? "Updates live from your plan · nothing planned yet"
              : `Live from your plan · ${list.lineCount} items · ${plannedMeals} meals`}
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep }}>
          {plannedMeals === 0 ? "—" : open ? "Hide ▴" : "Open ▾"}
        </span>
      </button>

      {plannedMeals === 0 && (
        <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "8px 2px 0", lineHeight: 1.45 }}>
          {emptyHint}
        </p>
      )}

      {open && plannedMeals > 0 && (
        <Card style={{ marginTop: 8, padding: 14 }}>
          <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 12px" }}>
            Shop-style list from your plan — we clean prep words, merge near-duplicates, and split a few compounds (like garlic butter → garlic + butter).
            Each line shows which meal it came from. Amounts stay as written in the recipes.
          </p>

          {list.sections.length === 0 ? (
            <div style={{ fontSize: 13.5, color: T.inkSoft }}>
              No structured ingredients on these meals yet.
            </div>
          ) : (
            list.sections.map((sec) => (
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
                      padding: "8px 0",
                      borderBottom: `1px solid ${T.border}`,
                      fontSize: 13.5,
                      lineHeight: 1.4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: T.ink, fontWeight: 600 }}>{row.item}</div>
                        {row.staple && (
                          <div style={{ fontSize: 11.5, color: T.inkSoft }}>Likely already on hand</div>
                        )}
                      </div>
                      <div
                        style={{
                          color: T.inkSoft,
                          textAlign: "right",
                          flexShrink: 0,
                          maxWidth: "42%",
                          fontSize: 12.5,
                        }}
                      >
                        {row.amounts.join("; ") || "—"}
                      </div>
                    </div>
                    {row.meals?.length > 0 && (
                      <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 4, lineHeight: 1.4 }}>
                        For: {row.meals.join(" · ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}

          {list.notes?.length > 0 && (
            <div
              style={{
                background: T.sageSoft,
                borderRadius: 12,
                padding: "10px 12px",
                marginBottom: 12,
              }}
            >
              {list.notes.map((n) => (
                <div key={n} style={{ fontSize: 12.5, color: "#3E5A46", lineHeight: 1.45, marginBottom: 4 }}>
                  {n}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Btn small onClick={onCopy} disabled={!list.lineCount}>
              {copied ? "Copied" : "Copy list"}
            </Btn>
            <span style={{ fontSize: 12.5, color: T.inkSoft }}>
              Paste into Notes or text your partner
            </span>
          </div>
          {error && (
            <div style={{ fontSize: 12.5, color: T.amber, marginTop: 8 }}>{error}</div>
          )}
        </Card>
      )}
    </div>
  );
}
