import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, Field, inputStyle } from "./ui";
import {
  addDaysIso,
  dayRelationLabel,
  formatLongDay,
  isTodayIso,
  localDateIso,
} from "../utils/dates";

function sourceLabel(source) {
  if (source === "photo") return "Photo";
  if (source === "text") return "Estimate";
  if (source === "manual") return "Manual";
  if (source === "recipe") return "Recipe";
  return null;
}

export function MealLogCard({
  busy,
  estimate,
  onAnalyzePhoto,
  onAnalyzeText,
  onConfirmEstimate,
  onDiscardEstimate,
  onManualLog,
  todayLog,
  onDeleteEntry,
  mealLogDate,
  onSelectMealDate,
}) {
  const [desc, setDesc] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ name: "", p: "", c: "", f: "" });

  const today = localDateIso();
  const date = mealLogDate || todayLog?.date || today;
  const onToday = isTodayIso(date);
  const relation = dayRelationLabel(date);
  const canGoForward = date < today;
  const entries = todayLog?.entries || [];

  const manP = Number(manual.p) || 0;
  const manC = Number(manual.c) || 0;
  const manF = Number(manual.f) || 0;
  const manCal = Math.round(manP * 4 + manC * 4 + manF * 9);

  const dayTotals = entries.reduce(
    (a, e) => ({
      cal: a.cal + (e.cal || 0),
      p: a.p + (e.p || 0),
      c: a.c + (e.c || 0),
      f: a.f + (e.f || 0),
    }),
    { cal: 0, p: 0, c: 0, f: 0 },
  );

  const addLabel = onToday ? "Add to today" : `Add to ${formatLongDay(date)}`;
  const headerTitle = relation ? `Log for ${relation}` : `Log for ${formatLongDay(date)}`;

  function goDay(delta) {
    const next = addDaysIso(date, delta);
    if (next > today) return;
    onSelectMealDate?.(next);
    setShowManual(false);
  }

  function jumpToday() {
    onSelectMealDate?.(today);
    setShowManual(false);
  }

  const submitManual = () => {
    if (!manual.name.trim()) return;
    onManualLog({
      name: manual.name.trim(),
      cal: manCal,
      p: manP,
      c: manC,
      f: manF,
      source: "manual",
      logged_date: date,
    });
    setManual({ name: "", p: "", c: "", f: "" });
    setShowManual(false);
  };

  return (
    <Card style={{ marginTop: 12 }}>
      {/* Day navigator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => goDay(-1)}
          style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            border: `1.5px solid ${T.border}`, background: "#fff",
            color: T.ink, fontSize: 20, lineHeight: 1, cursor: "pointer",
          }}
        >
          ‹
        </button>
        <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
          <div style={{ fontFamily: FD, fontSize: 18, lineHeight: 1.2 }}>{headerTitle}</div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
            {onToday ? formatLongDay(date) : formatLongDay(date)}
            {!onToday && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={jumpToday}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontFamily: F, fontSize: 13, fontWeight: 700, color: T.accent,
                    textDecoration: "underline",
                  }}
                >
                  Jump to today
                </button>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label="Next day"
          disabled={!canGoForward}
          onClick={() => goDay(1)}
          style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            border: `1.5px solid ${canGoForward ? T.border : T.track}`,
            background: "#fff",
            color: canGoForward ? T.ink : "#D8CCD1",
            fontSize: 20, lineHeight: 1,
            cursor: canGoForward ? "pointer" : "default",
          }}
        >
          ›
        </button>
      </div>

      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 14px", textAlign: "center" }}>
        {onToday
          ? "Snap a photo, describe it, or enter macros — everything saves to today’s food log."
          : `Browsing a past day. Add anything you forgot — it saves to ${formatLongDay(date)}.`}
      </p>

      {/* Full food log */}
      <div style={{
        background: T.bg, borderRadius: 14, padding: "12px 14px", marginBottom: 14,
        border: `1px solid ${T.border}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, textTransform: "uppercase", letterSpacing: 0.4 }}>
            {onToday ? "Today’s food log" : "Food log"}
          </div>
          {entries.length > 0 && (
            <div style={{ fontSize: 12.5, color: T.inkSoft }}>
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </div>
          )}
        </div>

        {entries.length === 0 ? (
          <div style={{ padding: "10px 0 4px", textAlign: "center" }}>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 4 }}>Nothing logged for this day yet.</div>
            <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45 }}>
              Use the options below to add what you ate.
            </div>
          </div>
        ) : (
          <>
            {entries.map((e) => {
              const src = sourceLabel(e.source);
              return (
                <div
                  key={e.id || `${e.name}-${e.cal}`}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    fontSize: 13.5, padding: "8px 0", gap: 8,
                    borderBottom: `1px solid ${T.border}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ color: T.ink, fontWeight: 700 }}>{e.name}</span>
                      {src && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: T.accentDeep,
                          background: T.accentSoft, borderRadius: 6, padding: "2px 7px",
                        }}>
                          {src}
                        </span>
                      )}
                    </div>
                    <div style={{ color: T.inkSoft, marginTop: 2, fontSize: 13 }}>
                      {Math.round(e.p)}P · {Math.round(e.c)}C · {Math.round(e.f)}F · {Math.round(e.cal)} cal
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteEntry(e.id)}
                    aria-label={`Remove ${e.name}`}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: T.inkSoft, fontSize: 12, fontWeight: 700, padding: "2px 0",
                      textDecoration: "underline", flexShrink: 0,
                    }}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              paddingTop: 10, fontSize: 13.5,
            }}>
              <span style={{ fontWeight: 700, color: T.inkSoft }}>Day total</span>
              <strong style={{ color: T.ink }}>
                {Math.round(dayTotals.p)}P · {Math.round(dayTotals.c)}C · {Math.round(dayTotals.f)}F ·{" "}
                {Math.round(dayTotals.cal)} cal
              </strong>
            </div>
          </>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 10 }}>
        {onToday ? "Add to today" : "Add to this day"}
      </div>

      {/* Photo */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 26 }}>📸</div>
        <div style={{ flex: 1, fontSize: 14, lineHeight: 1.5 }}>
          <b>Snap your plate</b><br />
          <span style={{ color: T.inkSoft, fontSize: 13 }}>Photo in, macro estimate out.</span>
        </div>
        <label style={{
          fontFamily: F, fontWeight: 700, fontSize: 13, cursor: busy ? "default" : "pointer",
          padding: "8px 14px", borderRadius: 999, background: busy ? "#D9C4CE" : T.accent, color: "#fff",
        }}>
          {busy ? "Reading…" : "Camera"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => { onAnalyzePhoto(e.target.files?.[0]); e.target.value = ""; }}
          />
        </label>
      </div>
      <label style={{
        display: "inline-block", marginBottom: 14, fontSize: 13, fontWeight: 700, color: T.accent,
        cursor: busy ? "default" : "pointer", textDecoration: "underline",
      }}>
        or choose from your photo library
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          style={{ display: "none" }}
          onChange={(e) => { onAnalyzePhoto(e.target.files?.[0]); e.target.value = ""; }}
        />
      </label>

      {/* Describe */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, marginBottom: 6 }}>Describe it</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="2 eggs and sourdough toast"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && desc.trim()) {
                onAnalyzeText(desc.trim());
                setDesc("");
              }
            }}
          />
          <Btn
            small
            disabled={busy || !desc.trim()}
            onClick={() => {
              const text = desc.trim();
              if (!text) return;
              onAnalyzeText(text);
              setDesc("");
            }}
          >
            Estimate
          </Btn>
        </div>
      </div>

      {/* Manual */}
      <button
        type="button"
        onClick={() => setShowManual((v) => !v)}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontSize: 13, fontWeight: 700, color: T.accent, textDecoration: "underline", marginBottom: showManual ? 10 : 0,
        }}
      >
        {showManual ? "Hide manual entry" : "I know my macros — enter them myself"}
      </button>

      {showManual && (
        <div style={{ background: T.accentSoft, borderRadius: 12, padding: "12px 14px", marginTop: 8 }}>
          <Field label="Meal name">
            <input
              style={inputStyle}
              value={manual.name}
              onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
              placeholder="Greek yogurt bowl"
            />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            {[["p", "Protein (g)"], ["c", "Carbs (g)"], ["f", "Fat (g)"]].map(([k, label]) => (
              <label key={k} style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginBottom: 4 }}>{label}</div>
                <input
                  style={{ ...inputStyle, padding: "10px 12px" }}
                  inputMode="decimal"
                  value={manual[k]}
                  onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
              {manCal} cal <span style={{ fontWeight: 400, color: T.inkSoft }}>(live)</span>
            </span>
            <Btn small disabled={!manual.name.trim()} onClick={submitManual}>{addLabel}</Btn>
          </div>
        </div>
      )}

      {busy && (
        <div style={{ marginTop: 12, fontSize: 13.5, color: T.inkSoft }}>
          Looking at your meal… this takes a few seconds.
        </div>
      )}

      {estimate?.error && (
        <div style={{ marginTop: 12, background: T.amberSoft, borderRadius: 12, padding: "10px 14px", fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>
          Couldn&apos;t read that one — try a clearer photo from above, or a shorter description of real food.
        </div>
      )}

      {estimate && !estimate.error && (
        <div style={{ marginTop: 12, background: T.accentSoft, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontFamily: FD, fontSize: 17 }}>{estimate.meal}</div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, margin: "2px 0 8px" }}>
            {(estimate.items || []).join(" · ")}
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>
            <span>{estimate.calories} cal</span>
            <span style={{ color: T.accentDeep }}>P {estimate.protein_g}g</span>
            <span style={{ color: T.inkSoft }}>C {estimate.carbs_g}g</span>
            <span style={{ color: T.inkSoft }}>F {estimate.fat_g}g</span>
          </div>
          {estimate.tip && (
            <div style={{ fontSize: 13, color: T.accentDeep, lineHeight: 1.5, marginBottom: 10 }}>💬 {estimate.tip}</div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Btn small onClick={onConfirmEstimate}>{addLabel}</Btn>
            <button
              onClick={onDiscardEstimate}
              style={{ background: "none", border: "none", fontSize: 13, color: T.inkSoft, cursor: "pointer", textDecoration: "underline" }}
            >
              discard
            </button>
            <span style={{ fontSize: 11.5, color: T.inkSoft, marginLeft: "auto" }}>
              AI estimate · {estimate.confidence} confidence
            </span>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 12, lineHeight: 1.45 }}>
        Recipes from your plan log exact macros. Photos and descriptions are smart estimates — plenty close for living inside your ranges. Past days stay in your history so you can catch up anytime.
      </div>
    </Card>
  );
}
