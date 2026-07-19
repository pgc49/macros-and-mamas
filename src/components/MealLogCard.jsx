import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, Field, inputStyle } from "./ui";

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
}) {
  const [desc, setDesc] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ name: "", p: "", c: "", f: "" });

  const manP = Number(manual.p) || 0;
  const manC = Number(manual.c) || 0;
  const manF = Number(manual.f) || 0;
  const manCal = Math.round(manP * 4 + manC * 4 + manF * 9);

  const submitManual = () => {
    if (!manual.name.trim()) return;
    onManualLog({
      name: manual.name.trim(),
      cal: manCal,
      p: manP,
      c: manC,
      f: manF,
      source: "manual",
    });
    setManual({ name: "", p: "", c: "", f: "" });
    setShowManual(false);
  };

  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Log your meals</div>
      <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 14px" }}>
        Tap a recipe from your plan, snap a photo, or type it.
      </p>

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
            <Btn small disabled={!manual.name.trim()} onClick={submitManual}>Add to today</Btn>
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
          Couldn't read that one — try a clearer photo from above, or a shorter description of real food.
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
            <Btn small onClick={onConfirmEstimate}>Add to today</Btn>
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

      {todayLog.entries.length > 0 && (
        <div style={{ marginTop: 14, borderTop: `1px dashed ${T.border}`, paddingTop: 10 }}>
          {todayLog.entries.map((e) => (
            <div key={e.id || `${e.name}-${e.cal}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "5px 0", gap: 8 }}>
              <span style={{ color: T.ink, flex: 1 }}>{e.name}</span>
              <span style={{ color: T.inkSoft, whiteSpace: "nowrap" }}>{e.cal} cal · P{e.p} C{e.c} F{e.f}</span>
              <button
                type="button"
                onClick={() => onDeleteEntry(e.id)}
                aria-label={`Remove ${e.name}`}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: T.inkSoft, fontSize: 16, lineHeight: 1, padding: "0 2px",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 12, lineHeight: 1.45 }}>
        Recipes from your plan log exact macros. Photos and descriptions are smart estimates — plenty close for living inside your ranges.
      </div>
    </Card>
  );
}
