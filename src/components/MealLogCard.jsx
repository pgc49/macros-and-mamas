import { useEffect, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn, inputStyle } from "./ui";
import { LoggableMealRow } from "./LoggableMealRow";
import { RECIPES } from "../content/data";
import {
  addDaysIso,
  formatLongDay,
  fmtRange,
  isTodayIso,
  localDateIso,
  wkStartOf,
} from "../utils/dates";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const VIA_LABEL = {
  photo: "AI estimate from photo",
  describe: "AI estimate from description",
  recipe: "from your plan · exact",
  custom: "from My meals",
  manual: "entered by you",
  adjusted: "adjusted by you",
};

const navBtn = (disabled) => ({
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: `1.5px solid ${disabled ? T.track : T.border}`,
  background: "#fff",
  color: disabled ? "#D8CCD1" : T.ink,
  fontSize: 15,
  cursor: disabled ? "default" : "pointer",
});

const pill = (ghost, disabled) => ({
  fontFamily: F,
  fontWeight: 700,
  fontSize: 13,
  cursor: disabled ? "default" : "pointer",
  padding: "9px 16px",
  borderRadius: 999,
  border: ghost ? `1.5px solid ${T.accent}` : "none",
  background: ghost ? "transparent" : disabled ? "#D9C4CE" : T.accent,
  color: ghost ? T.accent : "#fff",
  whiteSpace: "nowrap",
});

function totCell(label, val, lo, hi, unit) {
  const over = val > hi;
  return (
    <div
      key={label}
      style={{
        flex: 1,
        textAlign: "center",
        padding: "8px 0",
        borderRadius: 10,
        background: over ? T.amberSoft : T.sageSoft,
      }}
    >
      <div style={{ fontFamily: FD, fontSize: 17, color: over ? T.amber : "#3E5A46" }}>
        {Math.round(val)}
        {unit}
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: over ? T.amber : T.sage, letterSpacing: 0.4 }}>
        {label} · {lo}–{hi}
      </div>
    </div>
  );
}

function totalsCaption(totals, ranges) {
  if (totals.cal < ranges.cal[0]) {
    return "Room left in your ranges — under is fine mid-day, and low days happen.";
  }
  if (totals.cal > ranges.cal[1]) {
    return "A touch over the top of your range — tomorrow's a clean slate, no making up for it.";
  }
  return "Right inside your ranges. This is the win.";
}

export function MealLogCard({
  macros,
  recipes = RECIPES,
  plannedMeals = [],
  customMeals = [],
  busy,
  estimate,
  onAnalyzePhoto,
  onAnalyzeText,
  onConfirmEstimate,
  onDiscardEstimate,
  onManualLog,
  onLogRecipe,
  onSaveCustomMeal,
  todayLog,
  onUpdateEntry,
  onDeleteEntry,
  mealLogDate,
  mealLogWeekStart,
  daysWithEntries = {},
  onSelectMealDate,
  onChangeMealWeek,
  earliestWeekStart,
}) {
  const [method, setMethod] = useState(null); // snap | describe | recipes | manual
  const [desc, setDesc] = useState("");
  const [photoNote, setPhotoNote] = useState("");
  const [snapFile, setSnapFile] = useState(null);
  const [snapPreview, setSnapPreview] = useState(null);
  const [manual, setManual] = useState({ name: "", cal: "", p: "", c: "", f: "" });
  const [saveManualCustom, setSaveManualCustom] = useState(true);
  const [saveEstimateCustom, setSaveEstimateCustom] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [estimateDraft, setEstimateDraft] = useState(null);
  const camRef = useRef(null);
  const libRef = useRef(null);

  const clearSnap = () => {
    setSnapPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSnapFile(null);
    setPhotoNote("");
  };

  const stageSnap = (file) => {
    if (!file) return;
    setSnapPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setSnapFile(file);
  };

  useEffect(() => () => {
    // revoke on unmount
    setSnapPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  // AI result lands as an editable draft — she tweaks, then saves.
  useEffect(() => {
    if (!estimate || estimate.error) {
      setEstimateDraft(null);
      return;
    }
    // Analysis succeeded — drop the staged photo so the draft is the focus
    setSnapPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSnapFile(null);
    setPhotoNote("");
    setEstimateDraft({
      name: estimate.meal || "",
      cal: estimate.calories ?? "",
      p: estimate.protein_g ?? "",
      c: estimate.carbs_g ?? "",
      f: estimate.fat_g ?? "",
      items: estimate.items || [],
      tip: estimate.tip || "",
      confidence: estimate.confidence || "medium",
      baseline: {
        name: estimate.meal || "",
        cal: Number(estimate.calories) || 0,
        p: Number(estimate.protein_g) || 0,
        c: Number(estimate.carbs_g) || 0,
        f: Number(estimate.fat_g) || 0,
      },
    });
  }, [estimate]);

  const today = localDateIso();
  const date = mealLogDate || todayLog?.date || today;
  const weekStart = mealLogWeekStart || wkStartOf(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  const onToday = isTodayIso(date);
  const entries = todayLog?.entries || [];
  const curWk = wkStartOf();
  const earliest = earliestWeekStart || addDaysIso(curWk, -7 * 52);
  const canPrevWeek = weekStart > earliest;
  const canNextWeek = weekStart < curWk;

  const ranges = macros
    ? {
        cal: [macros.cal, macros.cal + 150],
        p: [macros.protein, macros.protein + 10],
        c: [macros.carbs, macros.carbs + 10],
        f: [macros.fat, macros.fat + 10],
      }
    : { cal: [0, 0], p: [0, 0], c: [0, 0], f: [0, 0] };

  const totals = entries.reduce(
    (a, e) => ({
      cal: a.cal + (Number(e.cal) || 0),
      p: a.p + (Number(e.p) || 0),
      c: a.c + (Number(e.c) || 0),
      f: a.f + (Number(e.f) || 0),
    }),
    { cal: 0, p: 0, c: 0, f: 0 },
  );

  const toggleMethod = (key) => {
    setMethod((m) => {
      const next = m === key ? null : key;
      if (m === "snap" && next !== "snap") clearSnap();
      return next;
    });
  };

  const selectDay = (d) => {
    if (d > today) return;
    setEditingId(null);
    setDraft(null);
    onSelectMealDate?.(d);
  };

  const changeWeek = (dir) => {
    const next = addDaysIso(weekStart, 7 * dir);
    if (dir < 0 && next < earliest) return;
    if (dir > 0 && next > curWk) return;
    setEditingId(null);
    setDraft(null);
    onChangeMealWeek?.(next);
  };

  const methodTile = (key, icon, label, sub) => (
    <button
      key={key}
      type="button"
      onClick={() => toggleMethod(key)}
      style={{
        flex: 1,
        padding: "12px 6px 10px",
        borderRadius: 14,
        cursor: "pointer",
        textAlign: "center",
        border: `1.5px solid ${method === key ? T.accent : T.border}`,
        background: method === key ? T.accentSoft : "#fff",
      }}
    >
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div
        style={{
          fontFamily: F,
          fontSize: 12.5,
          fontWeight: 700,
          color: method === key ? T.accentDeep : T.ink,
          marginTop: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: F, fontSize: 10, color: T.inkSoft, marginTop: 1 }}>{sub}</div>
    </button>
  );

  const submitManual = () => {
    if (!manual.name.trim()) return;
    onManualLog?.({
      name: manual.name.trim(),
      cal: Number(manual.cal) || 0,
      p: Number(manual.p) || 0,
      c: Number(manual.c) || 0,
      f: Number(manual.f) || 0,
      via: "manual",
      logged_date: date,
      saveCustom: saveManualCustom,
    });
    setManual({ name: "", cal: "", p: "", c: "", f: "" });
    setMethod(null);
  };

  const startEdit = (e) => {
    setEditingId(e.id);
    setDraft({ name: e.name, cal: e.cal, p: e.p, c: e.c, f: e.f, via: e.via, saveCustom: false });
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    const prevVia = draft.via;
    const nextVia = prevVia === "photo" || prevVia === "describe" ? "adjusted" : prevVia;
    await onUpdateEntry?.(editingId, {
      name: draft.name,
      cal: Number(draft.cal) || 0,
      p: Number(draft.p) || 0,
      c: Number(draft.c) || 0,
      f: Number(draft.f) || 0,
      via: nextVia || "manual",
    });
    if (draft.saveCustom) {
      await onSaveCustomMeal?.({
        name: draft.name,
        cal: Number(draft.cal) || 0,
        p: Number(draft.p) || 0,
        c: Number(draft.c) || 0,
        f: Number(draft.f) || 0,
      });
    }
    setEditingId(null);
    setDraft(null);
  };

  const removeWhileEditing = async (id) => {
    await onDeleteEntry?.(id);
    setEditingId(null);
    setDraft(null);
  };

  const numIn = (k, w = 58) => (
    <input
      inputMode="numeric"
      value={draft[k]}
      onChange={(ev) => setDraft((d) => ({ ...d, [k]: ev.target.value }))}
      style={{
        width: w,
        padding: "8px 8px",
        fontSize: 15,
        textAlign: "center",
        border: `1.5px solid ${T.border}`,
        borderRadius: 10,
        fontFamily: F,
      }}
    />
  );

  const estNumIn = (k, w = 58) => (
    <input
      inputMode="numeric"
      value={estimateDraft?.[k] ?? ""}
      onChange={(ev) => setEstimateDraft((d) => ({ ...d, [k]: ev.target.value }))}
      style={{
        width: w,
        padding: "8px 8px",
        fontSize: 15,
        textAlign: "center",
        border: `1.5px solid ${T.border}`,
        borderRadius: 10,
        fontFamily: F,
        background: "#fff",
      }}
    />
  );

  const saveEstimateDraft = async () => {
    if (!estimateDraft) return;
    const payload = {
      name: String(estimateDraft.name || "").trim() || "Meal",
      cal: Number(estimateDraft.cal) || 0,
      p: Number(estimateDraft.p) || 0,
      c: Number(estimateDraft.c) || 0,
      f: Number(estimateDraft.f) || 0,
    };
    const b = estimateDraft.baseline || {};
    const changed =
      payload.name !== (b.name || "")
      || payload.cal !== (Number(b.cal) || 0)
      || payload.p !== (Number(b.p) || 0)
      || payload.c !== (Number(b.c) || 0)
      || payload.f !== (Number(b.f) || 0);
    await onConfirmEstimate?.(payload, { adjusted: changed, saveCustom: saveEstimateCustom });
    setEstimateDraft(null);
    setSaveEstimateCustom(false);
    setMethod(null);
  };

  return (
    <div style={{ marginTop: 4 }}>
      {/* Day strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 0 4px" }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 22, margin: 0 }}>
          {formatLongDay(date)}
          {onToday && (
            <span style={{ fontFamily: F, fontSize: 13, color: T.accentDeep, fontWeight: 700 }}> · Today</span>
          )}
        </h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" disabled={!canPrevWeek} onClick={() => changeWeek(-1)} style={navBtn(!canPrevWeek)} aria-label="Previous week">
            ‹
          </button>
          <button type="button" disabled={!canNextWeek} onClick={() => changeWeek(1)} style={navBtn(!canNextWeek)} aria-label="Next week">
            ›
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>
        {fmtRange(weekStart)}
        {weekStart === curWk ? " · this week" : ""}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {weekDays.map((d, i) => {
          const isFuture = d > today;
          const sel = d === date;
          const has = !!daysWithEntries[d];
          return (
            <div key={d} style={{ flex: 1, textAlign: "center" }}>
              <button
                type="button"
                disabled={isFuture}
                onClick={() => selectDay(d)}
                aria-current={sel ? "date" : undefined}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  fontFamily: F,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isFuture ? "default" : "pointer",
                  position: "relative",
                  border: `1.5px solid ${sel ? T.accent : T.border}`,
                  background: sel ? T.accent : "#fff",
                  color: isFuture ? "#D8CCD1" : sel ? "#fff" : T.ink,
                }}
              >
                {DAY_LABELS[i]}
                {has && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 5,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: sel ? "#fff" : T.accent,
                    }}
                  />
                )}
              </button>
              {d === today && (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: T.accentDeep,
                    margin: "4px auto 0",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Entry methods */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 14, marginBottom: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 2 }}>Log a meal</div>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 10 }}>
          {onToday ? (
            "Adding to today."
          ) : (
            <>
              Adding to <b style={{ color: T.accentDeep }}>{formatLongDay(date)}</b>.
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          {methodTile("snap", "📸", "Snap", "photo")}
          {methodTile("describe", "✏️", "Describe", "type it")}
          {methodTile("recipes", "🍳", "My plan", "exact")}
          {methodTile("manual", "＃", "Macros", "I know them")}
        </div>

        {method === "snap" && (
          <div style={{ marginTop: 12 }}>
            {!snapFile ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" disabled={busy} style={pill(false, busy)} onClick={() => camRef.current?.click()}>
                  Open camera
                </button>
                <button type="button" disabled={busy} style={pill(true, busy)} onClick={() => libRef.current?.click()}>
                  Photo library
                </button>
                <span style={{ fontSize: 11.5, color: T.inkSoft }}>snap first, then add a note if you want</span>
              </div>
            ) : (
              <>
                {snapPreview && (
                  <div style={{
                    marginBottom: 10,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: `1px solid ${T.border}`,
                    background: "#fff",
                    maxHeight: 200,
                  }}
                  >
                    <img
                      src={snapPreview}
                      alt="Meal to estimate"
                      style={{ display: "block", width: "100%", maxHeight: 200, objectFit: "cover" }}
                    />
                  </div>
                )}
                <label style={{ display: "block", marginBottom: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, marginBottom: 6 }}>
                    Optional note <span style={{ fontWeight: 500 }}>(portions, oil, leftovers…)</span>
                  </div>
                  <input
                    value={photoNote}
                    onChange={(e) => setPhotoNote(e.target.value)}
                    placeholder="e.g. about 6 oz chicken, cooked in 1 tsp olive oil"
                    disabled={busy}
                    maxLength={400}
                    style={{ ...inputStyle, padding: "11px 13px", fontSize: 15 }}
                  />
                </label>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={busy || !snapFile}
                    style={pill(false, busy || !snapFile)}
                    onClick={() => {
                      if (!snapFile || busy) return;
                      onAnalyzePhoto?.(snapFile, photoNote.trim());
                    }}
                  >
                    {busy ? "Reading…" : "Estimate"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    style={pill(true, busy)}
                    onClick={() => camRef.current?.click()}
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    style={pill(true, busy)}
                    onClick={() => libRef.current?.click()}
                  >
                    Library
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={clearSnap}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: 13,
                      color: T.inkSoft,
                      cursor: busy ? "default" : "pointer",
                      textDecoration: "underline",
                      fontFamily: F,
                    }}
                  >
                    clear
                  </button>
                </div>
              </>
            )}
            <input
              ref={camRef}
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              style={{ display: "none" }}
              onChange={(e) => {
                stageSnap(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={libRef}
              type="file"
              accept="image/*"
              disabled={busy}
              style={{ display: "none" }}
              onChange={(e) => {
                stageSnap(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {method === "describe" && (
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="2 eggs and sourdough toast"
              disabled={busy}
              style={{ ...inputStyle, flex: 1, padding: "11px 13px", fontSize: 15 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && desc.trim() && !busy) {
                  onAnalyzeText?.(desc.trim());
                  setDesc("");
                }
              }}
            />
            <button
              type="button"
              disabled={busy || !desc.trim()}
              style={pill(false, busy || !desc.trim())}
              onClick={() => {
                const text = desc.trim();
                if (!text) return;
                onAnalyzeText?.(text);
                setDesc("");
              }}
            >
              {busy ? "…" : "Estimate"}
            </button>
          </div>
        )}

        {method === "recipes" && (
          <div style={{ marginTop: 12, maxHeight: 360, overflowY: "auto" }}>
            {(plannedMeals || []).length > 0 && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: T.accentDeep, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>
                  Your plan · {onToday ? "today" : formatLongDay(date)}
                </div>
                {plannedMeals.map((r) => (
                  <LoggableMealRow
                    key={r.id || `${r.slot}-${r.name}`}
                    meal={{
                      name: r.name,
                      cal: r.cal,
                      p: r.p,
                      c: r.c,
                      f: r.f,
                      slot: r.slot,
                    }}
                    via="recipe"
                    accent
                    confirmLog
                    onLog={async (scaled) => {
                      const ok = await onLogRecipe?.(scaled);
                      if (ok !== false) setMethod(null);
                      return ok;
                    }}
                  />
                ))}
              </>
            )}
            {(customMeals || []).length > 0 && (
              <>
                <div style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: (plannedMeals || []).length ? T.inkSoft : T.accentDeep,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  margin: (plannedMeals || []).length ? "12px 0 6px" : "0 0 6px",
                }}
                >
                  My meals
                </div>
                {customMeals.map((r) => (
                  <LoggableMealRow
                    key={r.id || r.name}
                    meal={r}
                    via="custom"
                    accent={!(plannedMeals || []).length}
                    confirmLog
                    onLog={async (scaled) => {
                      const ok = await onLogRecipe?.(scaled);
                      if (ok !== false) setMethod(null);
                      return ok;
                    }}
                  />
                ))}
              </>
            )}
            <div style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: T.inkSoft,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              margin: ((plannedMeals || []).length || (customMeals || []).length) ? "12px 0 6px" : "0 0 6px",
            }}
            >
              {(plannedMeals || []).length ? "Also in the bank" : "From the bank"}
            </div>
            {(plannedMeals || []).length === 0 && (customMeals || []).length === 0 && (
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8, lineHeight: 1.45 }}>
                Nothing on your Plan for this day yet — add meals under Meals → Plan, or pick from the bank below.
              </div>
            )}
            {recipes.map((r) => (
              <LoggableMealRow
                key={r.name}
                meal={r}
                via="recipe"
                confirmLog
                onLog={async (scaled) => {
                  const ok = await onLogRecipe?.(scaled);
                  if (ok !== false) setMethod(null);
                  return ok;
                }}
              />
            ))}
          </div>
        )}

        {method === "manual" && (
          <div style={{ marginTop: 12 }}>
            <input
              value={manual.name}
              onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
              placeholder="What was it?"
              style={{
                width: "100%",
                padding: "10px 13px",
                fontSize: 15,
                border: `1.5px solid ${T.border}`,
                borderRadius: 12,
                fontFamily: F,
                marginBottom: 8,
              }}
            />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {["cal", "p", "c", "f"].map((k) => (
                <div key={k} style={{ flex: 1 }}>
                  <input
                    inputMode="numeric"
                    value={manual[k]}
                    onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value }))}
                    placeholder={k.toUpperCase()}
                    style={{
                      width: "100%",
                      padding: "9px 6px",
                      fontSize: 14,
                      textAlign: "center",
                      border: `1.5px solid ${T.border}`,
                      borderRadius: 10,
                      fontFamily: F,
                    }}
                  />
                </div>
              ))}
              <button type="button" disabled={!manual.name.trim()} style={pill(false, !manual.name.trim())} onClick={submitManual}>
                Add
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={saveManualCustom}
                onChange={(e) => setSaveManualCustom(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, color: T.inkSoft }}>Save to My meals for next time</span>
            </label>
          </div>
        )}

        {busy && (
          <div style={{ marginTop: 12, fontSize: 13.5, color: T.inkSoft }}>
            Looking at your meal… this takes a few seconds.
          </div>
        )}

        {estimate?.error && (
          <div
            style={{
              marginTop: 12,
              background: T.amberSoft,
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 13.5,
              color: T.amber,
              lineHeight: 1.5,
            }}
          >
            {estimate.message
              || "Couldn't read that one — try a clearer photo from above, or a shorter description of real food."}
          </div>
        )}

        {estimate && !estimate.error && estimateDraft && (
          <div style={{ marginTop: 12, background: T.accentSoft, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.accentDeep, marginBottom: 8 }}>
              Review &amp; edit, then save
            </div>
            <input
              value={estimateDraft.name}
              onChange={(ev) => setEstimateDraft((d) => ({ ...d, name: ev.target.value }))}
              placeholder="Meal name"
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 15,
                fontWeight: 600,
                border: `1.5px solid ${T.border}`,
                borderRadius: 10,
                fontFamily: F,
                background: "#fff",
                marginBottom: 6,
                boxSizing: "border-box",
              }}
            />
            {(estimateDraft.items || []).length > 0 && (
              <div style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 8px", lineHeight: 1.45 }}>
                {estimateDraft.items.join(" · ")}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              {["cal", "p", "c", "f"].map((k) => (
                <div key={k} style={{ textAlign: "center" }}>
                  {estNumIn(k, 58)}
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft, marginTop: 2 }}>
                    {k.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
            {estimateDraft.tip && (
              <div style={{ fontSize: 13, color: T.accentDeep, lineHeight: 1.5, marginBottom: 10 }}>
                💬 {estimateDraft.tip}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Btn small onClick={saveEstimateDraft}>
                {onToday ? "Save to today" : `Save to ${formatLongDay(date)}`}
              </Btn>
              <button
                type="button"
                onClick={() => {
                  setEstimateDraft(null);
                  onDiscardEstimate?.();
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 13,
                  color: T.inkSoft,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                discard
              </button>
              <span style={{ fontSize: 11.5, color: T.inkSoft, marginLeft: "auto" }}>
                AI draft · {estimateDraft.confidence} confidence
              </span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={saveEstimateCustom}
                onChange={(e) => setSaveEstimateCustom(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, color: T.inkSoft }}>Also save to My meals</span>
            </label>
          </div>
        )}
      </div>

      {/* Day's log */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 8 }}>
          {onToday ? "Today's log" : `${formatLongDay(date)} log`}
        </div>

        {entries.length === 0 ? (
          <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6, padding: "6px 0 10px" }}>
            Nothing logged this day. Snap, describe, or tap a recipe to add it here.
          </div>
        ) : (
          <>
            {entries.map((e) =>
              editingId === e.id && draft ? (
                <div
                  key={e.id}
                  style={{
                    padding: "10px",
                    borderBottom: `1px solid ${T.border}`,
                    background: T.accentSoft,
                    borderRadius: 12,
                    marginBottom: 6,
                  }}
                >
                  <input
                    value={draft.name}
                    onChange={(ev) => setDraft((d) => ({ ...d, name: ev.target.value }))}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: 14,
                      fontWeight: 600,
                      border: `1.5px solid ${T.border}`,
                      borderRadius: 10,
                      fontFamily: F,
                      marginBottom: 8,
                    }}
                  />
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {["cal", "p", "c", "f"].map((k) => (
                      <div key={k} style={{ textAlign: "center" }}>
                        {numIn(k, 58)}
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft, marginTop: 2 }}>
                          {k.toUpperCase()}
                        </div>
                      </div>
                    ))}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      <button type="button" style={pill(false)} onClick={saveEdit}>
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => removeWhileEditing(e.id)}
                        style={{
                          background: "none",
                          border: "none",
                          fontSize: 12.5,
                          color: T.inkSoft,
                          cursor: "pointer",
                          textDecoration: "underline",
                          fontFamily: F,
                        }}
                      >
                        remove
                      </button>
                    </div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!draft.saveCustom}
                      onChange={(ev) => setDraft((d) => ({ ...d, saveCustom: ev.target.checked }))}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ fontSize: 12.5, color: T.inkSoft }}>Save to My meals</span>
                  </label>
                </div>
              ) : (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => startEdit(e)}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 2px",
                    border: "none",
                    borderBottom: `1px solid ${T.border}`,
                    background: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: F,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{e.name}</div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: e.via === "photo" || e.via === "describe" ? T.accentDeep : T.inkSoft,
                      }}
                    >
                      {VIA_LABEL[e.via] || "adjusted by you"}
                      {e.via === "photo" || e.via === "describe" ? " · tap to adjust" : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: T.inkSoft, whiteSpace: "nowrap" }}>
                    {Math.round(e.cal)} cal · P {Math.round(e.p)}g · C {Math.round(e.c)}g · F {Math.round(e.f)}g
                  </div>
                  <span style={{ color: T.inkSoft, fontSize: 15 }}>›</span>
                </button>
              ),
            )}

            {macros && (
              <>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {totCell("CAL", totals.cal, ranges.cal[0], ranges.cal[1], "")}
                  {totCell("P", totals.p, ranges.p[0], ranges.p[1], "g")}
                  {totCell("C", totals.c, ranges.c[0], ranges.c[1], "g")}
                  {totCell("F", totals.f, ranges.f[0], ranges.f[1], "g")}
                </div>
                <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
                  {totalsCaption(totals, ranges)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
