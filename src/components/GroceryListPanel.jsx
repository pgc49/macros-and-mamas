import { useMemo, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn } from "./ui";
import { buildGroceryList, formatGroceryListText } from "../utils/groceryList";
import { copyText } from "../utils/clipboard";

/**
 * Grocery list for Meals → By Day.
 * Pure client-side from week meal ingredients — no network.
 */
export function GroceryListPanel({ weekDays, personalized = false }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const list = useMemo(() => buildGroceryList(weekDays || []), [weekDays]);

  const onCopy = async () => {
    setError("");
    try {
      const text = formatGroceryListText(list, {
        title: personalized
          ? "Macros and Mamas — my week grocery list"
          : "Macros and Mamas — sample week grocery list",
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
        onClick={() => setOpen((o) => !o)}
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
          cursor: "pointer",
          fontFamily: F,
          textAlign: "left",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: open ? T.accentDeep : T.ink }}>
            Grocery list
          </div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
            From this week’s meals · {list.lineCount} items
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.accentDeep }}>
          {open ? "Hide ▴" : "Open ▾"}
        </span>
      </button>

      {open && (
        <Card style={{ marginTop: 8, padding: 14 }}>
          <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 12px" }}>
            Shop-ready list from {personalized ? "your personalized week" : "this sample week"}.
            Amounts stay as written in the recipes — we don’t guess package sizes.
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
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "6px 0",
                      borderBottom: `1px solid ${T.border}`,
                      fontSize: 13.5,
                      lineHeight: 1.4,
                    }}
                  >
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
                        maxWidth: "46%",
                        fontSize: 12.5,
                      }}
                    >
                      {row.amounts.join("; ") || "—"}
                    </div>
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
