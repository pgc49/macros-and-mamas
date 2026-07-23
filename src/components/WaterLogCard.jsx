import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card } from "./ui";
import { formatLongDay, isTodayIso } from "../utils/dates";

/** Soft water blue — distinct from brand accent, not purple. */
const WATER = "#4F7F97";
const WATER_SOFT = "#E4F0F5";
const WATER_BORDER = "#B7D0DC";

/**
 * Water log card — sits under the meal log on Today.
 * Uses the same selected day as the meal log (mealLogDate).
 */
export function WaterLogCard({
  date,
  goalOz,
  bottleOz = 24,
  entries = [],
  busy = false,
  onAdd,
  onUndo,
  onChangeBottle,
  electrolytesUrl,
  readOnly = false,
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customOz, setCustomOz] = useState("");
  const [editingBottle, setEditingBottle] = useState(false);
  const [bottleDraft, setBottleDraft] = useState(String(bottleOz));

  const total = (entries || []).reduce((s, e) => s + (Number(e.oz) || 0), 0);
  const goal = Number(goalOz) || 0;
  const hit = goal > 0 && total >= goal;
  const bottle = Math.max(1, Number(bottleOz) || 24);
  const bottlesLogged = bottle > 0 ? total / bottle : 0;
  const bottleLabel = Number.isInteger(bottlesLogged)
    ? String(bottlesLogged)
    : bottlesLogged.toFixed(1).replace(/\.0$/, "");
  const pct = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;
  const onToday = isTodayIso(date);
  const barColor = hit ? T.sage : WATER;
  const barTrack = hit ? T.sageSoft : WATER_SOFT;

  const addCustom = () => {
    const n = Number(customOz);
    if (!n || n <= 0) return;
    onAdd?.(n);
    setCustomOz("");
    setCustomOpen(false);
  };

  const saveBottle = () => {
    const n = Math.round(Number(bottleDraft));
    if (!n || n < 4 || n > 64) return;
    onChangeBottle?.(n);
    setEditingBottle(false);
  };

  return (
    <Card style={{ marginTop: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ fontSize: 18, color: WATER, lineHeight: 1 }}>💧</span>
          <span style={{ fontFamily: F, fontSize: 13, fontWeight: 700, letterSpacing: 0.06, textTransform: "uppercase", color: T.ink }}>
            Water
          </span>
        </div>
        <div style={{ fontFamily: FD, fontSize: 20, color: T.ink }}>
          {Math.round(total)} of {goal || "—"} oz
        </div>
      </div>

      {!onToday && (
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>
          Logging for <b style={{ color: T.accentDeep }}>{formatLongDay(date)}</b>
        </div>
      )}

      <div style={{ height: 10, borderRadius: 99, background: barTrack, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99, transition: "width 0.25s ease" }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: T.inkSoft, marginBottom: 14 }}>
        <span>half {readOnly ? "her" : "your"} goal weight, plus electrolytes</span>
        <span style={{ fontWeight: 700, color: hit ? T.sage : T.inkSoft, whiteSpace: "nowrap" }}>
          {total > 0
            ? `${bottleLabel} × ${readOnly ? "her" : "your"} bottle`
            : readOnly
              ? "none logged"
              : "tap to log"}
        </span>
      </div>

      {hit && (
        <div style={{ fontSize: 12.5, color: T.sage, fontWeight: 700, marginBottom: 12, lineHeight: 1.4 }}>
          Goal hit — checked off on {readOnly ? "her" : "your"} week
        </div>
      )}

      {readOnly ? (
        <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
          Bottle size: {bottle} oz · read-only
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAdd?.(bottle)}
              style={{
                flex: "1 1 140px",
                fontFamily: F,
                fontSize: 13,
                fontWeight: 700,
                padding: "11px 14px",
                borderRadius: 999,
                border: "none",
                background: WATER,
                color: "#fff",
                cursor: busy ? "default" : "pointer",
              }}
            >
              + My bottle · {bottle} oz
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAdd?.(8)}
              style={{
                flex: "0 0 auto",
                fontFamily: F,
                fontSize: 13,
                fontWeight: 700,
                padding: "11px 14px",
                borderRadius: 999,
                border: `1.5px solid ${WATER_BORDER}`,
                background: WATER_SOFT,
                color: WATER,
                cursor: busy ? "default" : "pointer",
              }}
            >
              + Glass · 8 oz
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCustomOpen((o) => !o)}
              style={{
                flex: "0 0 auto",
                fontFamily: F,
                fontSize: 13,
                fontWeight: 700,
                padding: "11px 14px",
                borderRadius: 999,
                border: `1.5px solid ${T.border}`,
                background: "#fff",
                color: T.ink,
                cursor: busy ? "default" : "pointer",
              }}
            >
              + oz
            </button>
          </div>

          {customOpen && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="1"
                placeholder="oz"
                value={customOz}
                onChange={(e) => setCustomOz(e.target.value)}
                style={{
                  width: 88,
                  padding: "10px 12px",
                  fontSize: 15,
                  border: `1.5px solid ${T.border}`,
                  borderRadius: 12,
                  fontFamily: F,
                }}
              />
              <button
                type="button"
                disabled={busy || !Number(customOz)}
                onClick={addCustom}
                style={{
                  fontFamily: F,
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "10px 16px",
                  borderRadius: 999,
                  border: "none",
                  background: WATER,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              marginTop: 14,
              paddingTop: 12,
              borderTop: `1px dashed ${T.border}`,
              flexWrap: "wrap",
            }}
          >
            {editingBottle ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  min="4"
                  max="64"
                  value={bottleDraft}
                  onChange={(e) => setBottleDraft(e.target.value)}
                  style={{
                    width: 72,
                    padding: "8px 10px",
                    fontSize: 14,
                    border: `1.5px solid ${T.border}`,
                    borderRadius: 10,
                    fontFamily: F,
                  }}
                />
                <button type="button" onClick={saveBottle} style={{ fontFamily: F, fontSize: 12, fontWeight: 700, color: WATER, background: "none", border: "none", cursor: "pointer" }}>
                  Save
                </button>
                <button type="button" onClick={() => setEditingBottle(false)} style={{ fontFamily: F, fontSize: 12, fontWeight: 700, color: T.inkSoft, background: "none", border: "none", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setBottleDraft(String(bottle));
                  setEditingBottle(true);
                }}
                style={{ fontFamily: F, fontSize: 12.5, color: T.inkSoft, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
              >
                my bottle is {bottle} oz — change
              </button>
            )}
            <button
              type="button"
              disabled={busy || !(entries || []).length}
              onClick={() => onUndo?.()}
              style={{
                fontFamily: F,
                fontSize: 12.5,
                fontWeight: 700,
                color: (entries || []).length ? T.accent : T.inkSoft,
                background: "none",
                border: "none",
                padding: 0,
                cursor: (entries || []).length ? "pointer" : "default",
              }}
            >
              undo last
            </button>
          </div>

          {electrolytesUrl && (
            <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.45 }}>
              <a href={electrolytesUrl} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}>
                Callie&apos;s electrolytes on Fullscript →
              </a>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
