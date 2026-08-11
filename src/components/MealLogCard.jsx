import { useEffect, useMemo, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn, inputStyle } from "./ui";
import { LoggableMealRow } from "./LoggableMealRow";
import { SlotChips } from "./SlotChips";
import { RECIPES, PANTRY_ITEMS } from "../content/data";
import { PANTRY_GROUPS } from "../content/pantry";
import {
  addDaysIso,
  formatLongDay,
  fmtRange,
  isTodayIso,
  localDateIso,
  wkStartOf,
} from "../utils/dates";
import {
  SLOT_LABEL,
  SLOT_SECTION_ORDER,
  guessSlotFromTime,
  groupEntriesBySlot,
  normalizeSlot,
  resolveLogSlot,
} from "../utils/mealSlots";
import { formatServings, ServingStepper, snapServings } from "../utils/servings";
import { recipeNoteFromMeal } from "../utils/planMealShape";
import { targetBands } from "../utils/weekPlan";
import { roomLeftFromTotals } from "../utils/eatingOutImpact";
import { EatingOutMenuFlow } from "./EatingOutMenuFlow";
import { LogMealRefine } from "./LogMealRefine";

/** She pasted a link — the estimator only reads text, so say so plainly. */
const URL_RE = /(https?:\/\/|www\.)\S+/i;

/** Matches MAX_DESCRIPTION_CHARS in functions/api/estimate.js. */
const DESCRIBE_MAX = 1000;

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const VIA_LABEL = {
  photo: "AI estimate from photo",
  describe: "AI estimate from description",
  recipe: "from your plan · exact",
  custom: "from My meals",
  manual: "entered by you",
  adjusted: "adjusted by you",
  menu: "from menu · rough estimate",
};

const AI_VIA = new Set(["photo", "describe", "menu"]);

const stripServingSuffix = (name) => String(name || "Meal").replace(/\s·\s[\d.]+×$/, "");

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
  onEstimateRefine,
  onMealIdea,
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
  const [snapItems, setSnapItems] = useState([]); // { file, previewUrl }[]
  /** Under Snap: plate photo flow vs Menu recommendation expander. */
  const [snapMenuOpen, setSnapMenuOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", cal: "", p: "", c: "", f: "" });
  const [saveManualCustom, setSaveManualCustom] = useState(true);
  const [saveEstimateCustom, setSaveEstimateCustom] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [estimateDraft, setEstimateDraft] = useState(null);
  const [pantryGroup, setPantryGroup] = useState("all");
  const [logSlot, setLogSlot] = useState(() => guessSlotFromTime());
  // What was sent for the estimate on screen, so "I added X" can re-ask
  // about the whole plate instead of throwing the first answer away.
  const [lastInput, setLastInput] = useState(null);
  const [rowRefineBusy, setRowRefineBusy] = useState(false);
  const [rowRefineError, setRowRefineError] = useState("");
  const camRef = useRef(null);
  const libRef = useRef(null);
  // Read at estimate-arrival time only — putting lastInput in the effect
  // deps would rebuild the draft (and wipe in-progress edits) the moment
  // she taps Update estimate, before the new result lands.
  const lastInputRef = useRef(lastInput);
  lastInputRef.current = lastInput;
  const pantryVisible = pantryGroup === "all"
    ? PANTRY_ITEMS
    : PANTRY_ITEMS.filter((item) => item.group === pantryGroup);

  const MAX_SNAP_PHOTOS = 3;

  const clearSnap = () => {
    setSnapItems((prev) => {
      prev.forEach((item) => {
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    setPhotoNote("");
  };

  const stageSnapFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => f && f.type?.startsWith("image/"));
    if (!incoming.length) return;
    setSnapItems((prev) => {
      const room = Math.max(0, MAX_SNAP_PHOTOS - prev.length);
      if (room < 1) return prev;
      const next = [...prev];
      for (const file of incoming.slice(0, room)) {
        next.push({ file, previewUrl: URL.createObjectURL(file) });
      }
      return next;
    });
  };

  const removeSnapAt = (index) => {
    setSnapItems((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  useEffect(() => () => {
    setSnapItems((prev) => {
      prev.forEach((item) => {
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
  }, []);

  // AI result lands as an editable draft — she tweaks, then saves.
  // sourceText is a copy of what she wrote so she can edit it in place and
  // re-run (Describe used to wipe the box, so a light estimate meant
  // typing the whole meal again).
  // Keep the draft across a failed/in-flight re-estimate so Snap doesn't
  // wipe a good review if the second read fails or App briefly clears estimate.
  useEffect(() => {
    if (!estimate) {
      if (!busy) setEstimateDraft(null);
      return;
    }
    if (estimate.error) return;
    const input = lastInputRef.current;
    setEstimateDraft({
      name: estimate.meal || "",
      cal: estimate.calories ?? "",
      p: estimate.protein_g ?? "",
      c: estimate.carbs_g ?? "",
      f: estimate.fat_g ?? "",
      items: estimate.items || [],
      tip: estimate.tip || "",
      confidence: estimate.confidence || "medium",
      sourceKind: input?.kind || null,
      sourceText: input?.text || "",
      baseline: {
        name: estimate.meal || "",
        cal: Number(estimate.calories) || 0,
        p: Number(estimate.protein_g) || 0,
        c: Number(estimate.carbs_g) || 0,
        f: Number(estimate.fat_g) || 0,
      },
    });
  }, [estimate, busy]);

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

  const logRoom = useMemo(() => {
    const bands = targetBands(macros);
    return roomLeftFromTotals(totals, bands);
  }, [macros, totals.cal, totals.p, totals.c, totals.f]);

  const pickMenuMeal = async (meal, opts = {}) => {
    if (!meal || !onManualLog) return false;
    const recipeNote = recipeNoteFromMeal(meal);
    const ok = await onManualLog({
      name: String(meal.name || "").trim() || "Restaurant meal",
      cal: Number(meal.cal) || 0,
      p: Number(meal.p) || 0,
      c: Number(meal.c) || 0,
      f: Number(meal.f) || 0,
      via: "menu",
      slot: resolveLogSlot(meal.slot || logSlot),
      logged_date: date,
      saveCustom: !!opts.saveToMine,
      serves: Number(meal.servings) || 1,
      ...(recipeNote ? { ingredients: recipeNote } : {}),
    });
    if (ok === false) return false;
    setSnapMenuOpen(false);
    setMethod(null);
    return true;
  };

  const toggleMethod = (key) => {
    setMethod((m) => {
      const next = m === key ? null : key;
      if (m === "snap" && next !== "snap") {
        clearSnap();
        setSnapMenuOpen(false);
      }
      if (next === "snap") setSnapMenuOpen(false);
      if (next) setLogSlot(guessSlotFromTime());
      return next;
    });
  };

  const openSnapPlate = (source) => {
    setSnapMenuOpen(false);
    if (source === "camera") camRef.current?.click();
    else if (source === "library") libRef.current?.click();
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
        minWidth: 0,
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
      slot: resolveLogSlot(logSlot),
      logged_date: date,
      saveCustom: saveManualCustom,
    });
    setManual({ name: "", cal: "", p: "", c: "", f: "" });
    setMethod(null);
  };

  const startEdit = (e) => {
    setEditingId(e.id);
    setRowRefineError("");
    const baseName = stripServingSuffix(e.name);
    const base = {
      cal: Number(e.cal) || 0,
      p: Number(e.p) || 0,
      c: Number(e.c) || 0,
      f: Number(e.f) || 0,
    };
    setDraft({
      name: e.name,
      baseName,
      base,
      editServings: 1,
      cal: base.cal,
      p: base.p,
      c: base.c,
      f: base.f,
      via: e.via,
      slot: normalizeSlot(e.slot) || (onToday ? guessSlotFromTime() : "lunch"),
      saveCustom: false,
      handTweaked: false,
    });
  };

  const applyEditServings = (nextQty) => {
    setDraft((d) => {
      if (!d?.base) return d;
      const q = snapServings(nextQty);
      const mul = (v) => Math.round((Number(v) || 0) * q);
      return {
        ...d,
        editServings: q,
        cal: mul(d.base.cal),
        p: mul(d.base.p),
        c: mul(d.base.c),
        f: mul(d.base.f),
        name: q === 1 ? d.baseName : `${d.baseName} · ${formatServings(q)}×`,
      };
    });
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    const prevVia = draft.via;
    const nextVia = draft.handTweaked && AI_VIA.has(prevVia)
      ? "adjusted"
      : (prevVia || "manual");
    await onUpdateEntry?.(editingId, {
      name: draft.name,
      cal: Number(draft.cal) || 0,
      p: Number(draft.p) || 0,
      c: Number(draft.c) || 0,
      f: Number(draft.f) || 0,
      via: nextVia,
      slot: resolveLogSlot(draft.slot),
    });
    if (draft.saveCustom) {
      await onSaveCustomMeal?.({
        name: draft.baseName || stripServingSuffix(draft.name),
        cal: Number(draft.base?.cal ?? draft.cal) || 0,
        p: Number(draft.base?.p ?? draft.p) || 0,
        c: Number(draft.base?.c ?? draft.c) || 0,
        f: Number(draft.base?.f ?? draft.f) || 0,
      });
    }
    setEditingId(null);
    setDraft(null);
    setRowRefineError("");
  };

  const refineRowEstimate = async ({ files, description } = {}) => {
    if (!draft || rowRefineBusy || !onEstimateRefine) return false;
    setRowRefineBusy(true);
    setRowRefineError("");
    const result = await onEstimateRefine({
      files,
      description,
      currentMeal: {
        name: draft.name,
        cal: draft.cal,
        p: draft.p,
        c: draft.c,
        f: draft.f,
      },
    });
    if (!result || result.error) {
      setRowRefineError(result?.message || "Couldn't update that estimate — try again or edit macros by hand.");
      setRowRefineBusy(false);
      return false;
    }
    const via = (Array.isArray(files) && files.length) ? "photo" : "describe";
    const nextName = String(result.meal || draft.name || "Meal").trim().slice(0, 80) || draft.name;
    const base = {
      cal: Math.round(Number(result.calories) || 0),
      p: Math.round(Number(result.protein_g) || 0),
      c: Math.round(Number(result.carbs_g) || 0),
      f: Math.round(Number(result.fat_g) || 0),
    };
    setDraft((d) => ({
      ...d,
      name: nextName,
      baseName: stripServingSuffix(nextName),
      base,
      editServings: 1,
      ...base,
      via,
      handTweaked: false,
    }));
    setRowRefineBusy(false);
    return true;
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
      onChange={(ev) => setDraft((d) => {
        const raw = ev.target.value;
        const next = { ...d, [k]: raw, handTweaked: true };
        // Keep serving-stepper base in sync with hand edits (as 1× equivalent).
        if (d?.base) {
          const q = snapServings(d.editServings || 1) || 1;
          const val = Number(raw) || 0;
          next.base = { ...d.base, [k]: Math.round(val / q) };
        }
        return next;
      })}
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

  /** Fire a photo estimate and remember the note it was based on. */
  const runSnapEstimate = (note) => {
    if (!snapItems.length || busy) return;
    const text = String(note || "").trim();
    setLastInput({ kind: "photo", text });
    onAnalyzePhoto?.(snapItems.map((s) => s.file), text);
  };

  const runTextEstimate = (text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed || busy) return;
    setLastInput({ kind: "text", text: trimmed });
    onAnalyzeText?.(trimmed);
  };

  /**
   * Re-run the estimate using the text in the review panel — either the
   * Describe box she just edited, or the Snap note with something added.
   * The photo(s) stay; only the text changes.
   */
  const reEstimateFromSource = () => {
    if (!estimateDraft || busy) return;
    const text = String(estimateDraft.sourceText || "").trim();
    if (estimateDraft.sourceKind === "photo" && snapItems.length) {
      setPhotoNote(text);
      runSnapEstimate(text);
      return;
    }
    if (!text) return;
    setDesc(text);
    runTextEstimate(text);
  };

  const clearEstimateInputs = () => {
    clearSnap();
    setSnapMenuOpen(false);
    setDesc("");
    setLastInput(null);
  };

  const sourceDirty = estimateDraft
    && String(estimateDraft.sourceText || "").trim() !== String(lastInput?.text || "").trim();
  const canReEstimate = !!estimateDraft && !busy && (
    estimateDraft.sourceKind === "photo"
      ? snapItems.length > 0 && sourceDirty
      : sourceDirty && String(estimateDraft.sourceText || "").trim().length > 0
  );

  const saveEstimateDraft = async () => {
    if (!estimateDraft || busy) return;
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
    const ok = await onConfirmEstimate?.(payload, {
      adjusted: changed,
      saveCustom: saveEstimateCustom,
      slot: resolveLogSlot(logSlot),
    });
    if (ok === false) return;
    setEstimateDraft(null);
    setSaveEstimateCustom(false);
    clearEstimateInputs();
    setMethod(null);
  };

  const slotBuckets = groupEntriesBySlot(entries, { logDate: date, todayIso: today });
  const hasAnyEntries = entries.length > 0;

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
          {methodTile("snap", "📸", "Snap", "plate or menu")}
          {methodTile("describe", "✏️", "Describe", "type it")}
          {methodTile("recipes", "🍳", "My plan", "exact")}
          {methodTile("manual", "＃", "Macros", "I know them")}
        </div>

        {method === "snap" && (
          <div style={{ marginTop: 12 }}>
            {/* While a draft is up the review panel owns the screen —
                photos stay in state behind it for re-estimating. */}
            {estimateDraft ? null : (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: snapMenuOpen || snapItems.length ? 12 : 0 }}>
                  <button
                    type="button"
                    disabled={busy || snapMenuOpen}
                    style={pill(false, busy || snapMenuOpen)}
                    onClick={() => openSnapPlate("camera")}
                  >
                    Open camera
                  </button>
                  <button
                    type="button"
                    disabled={busy || snapMenuOpen}
                    style={pill(true, busy || snapMenuOpen)}
                    onClick={() => openSnapPlate("library")}
                  >
                    Photo library
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    style={pill(!snapMenuOpen, busy)}
                    onClick={() => {
                      setSnapMenuOpen((open) => {
                        if (!open) clearSnap(); // opening Menu — drop any staged plate photos
                        return !open;
                      });
                    }}
                  >
                    Menu
                  </button>
                  {!snapMenuOpen && !snapItems.length && (
                    <span style={{ fontSize: 11.5, color: T.inkSoft }}>
                      plate photo, or menu to decide
                    </span>
                  )}
                </div>

                {snapMenuOpen ? (
                  <div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 6 }}>
                        Slot for this meal
                      </div>
                      <SlotChips value={logSlot} onChange={setLogSlot} />
                    </div>
                    <EatingOutMenuFlow
                      slot={logSlot}
                      macros={macros}
                      remaining={logRoom.remaining}
                      dayTotals={logRoom.dayTotals}
                      bands={logRoom.bands}
                      onMealIdea={onMealIdea}
                      onPick={pickMenuMeal}
                      addLabel="I ordered this"
                      roomCaption="logged so far"
                      defaultSaveMine={false}
                      intro={(
                        <>
                          Snap the menu — this is a <b style={{ color: T.ink }}>recommendation</b>, not a log yet.
                          A short note helps. You’ll get up to 5 ranked picks for today’s ranges — tap the one you ordered.
                        </>
                      )}
                    />
                  </div>
                ) : !snapItems.length ? null : (
                  <>
                    <div
                      className="mam-h-scroll"
                      style={{
                      display: "flex",
                      gap: 8,
                      overflowX: "auto",
                      marginBottom: 10,
                      WebkitOverflowScrolling: "touch",
                    }}
                    >
                      {snapItems.map((item, idx) => (
                        <div
                          key={`${item.previewUrl}-${idx}`}
                          style={{
                            position: "relative",
                            flex: "0 0 auto",
                            width: snapItems.length === 1 ? "100%" : 112,
                            maxWidth: snapItems.length === 1 ? "100%" : 112,
                            borderRadius: 12,
                            overflow: "hidden",
                            border: `1px solid ${T.border}`,
                            background: "#fff",
                            height: snapItems.length === 1 ? 200 : 112,
                          }}
                        >
                          <img
                            src={item.previewUrl}
                            alt={idx === 0 ? "Meal photo" : `Extra photo ${idx + 1}`}
                            style={{
                              display: "block",
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => removeSnapAt(idx)}
                            aria-label={`Remove photo ${idx + 1}`}
                            style={{
                              position: "absolute",
                              top: 6,
                              right: 6,
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              border: "none",
                              background: "rgba(51,39,46,0.72)",
                              color: "#fff",
                              fontSize: 16,
                              lineHeight: 1,
                              cursor: busy ? "default" : "pointer",
                              fontFamily: F,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    {snapItems.length < MAX_SNAP_PHOTOS && (
                      <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 10, lineHeight: 1.4 }}>
                        Add another plate, side, or nutrition label — everything across the photos is totaled. Up to {MAX_SNAP_PHOTOS}.
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
                        disabled={busy || !snapItems.length}
                        style={pill(false, busy || !snapItems.length)}
                        onClick={() => runSnapEstimate(photoNote)}
                      >
                        {busy ? "Reading…" : "Estimate"}
                      </button>
                      {snapItems.length < MAX_SNAP_PHOTOS && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            style={pill(true, busy)}
                            onClick={() => openSnapPlate("camera")}
                          >
                            Add photo
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            style={pill(true, busy)}
                            onClick={() => openSnapPlate("library")}
                          >
                            From library
                          </button>
                        </>
                      )}
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
                setSnapMenuOpen(false);
                stageSnapFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={libRef}
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              style={{ display: "none" }}
              onChange={(e) => {
                setSnapMenuOpen(false);
                stageSnapFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {method === "describe" && !estimateDraft && (
          <div style={{ marginTop: 12 }}>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value.slice(0, DESCRIBE_MAX))}
              placeholder="2 eggs and sourdough toast"
              disabled={busy}
              rows={2}
              maxLength={DESCRIBE_MAX}
              style={{
                ...inputStyle,
                width: "100%",
                padding: "11px 13px",
                fontSize: 15,
                resize: "vertical",
                minHeight: 44,
                boxSizing: "border-box",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && desc.trim() && !busy) {
                  e.preventDefault();
                  runTextEstimate(desc);
                }
              }}
            />
            {URL_RE.test(desc) && (
              <div
                style={{
                  marginTop: 8,
                  background: T.amberSoft,
                  borderRadius: 10,
                  padding: "9px 12px",
                  fontSize: 12.5,
                  color: T.amber,
                  lineHeight: 1.5,
                }}
              >
                I can’t open links. Paste the ingredients themselves — or for a full
                recipe, use <b>Create a recipe</b> under Meals → My meals so you can set
                how many servings it makes.
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 8,
              }}
            >
              <button
                type="button"
                disabled={busy || !desc.trim()}
                style={pill(false, busy || !desc.trim())}
                onClick={() => runTextEstimate(desc)}
              >
                {busy ? "…" : "Estimate"}
              </button>
              <span style={{ fontSize: 11.5, color: T.inkSoft }}>
                {desc.length >= DESCRIBE_MAX
                  ? "That's the limit for one meal — save longer recipes under My meals."
                  : "One meal, not a whole recipe."}
              </span>
              <span style={{ fontSize: 11, color: T.inkSoft, marginLeft: "auto" }}>
                {desc.length}/{DESCRIBE_MAX}
              </span>
            </div>
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
                    onLog={onLogRecipe}
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
                    onLog={onLogRecipe}
                    onSaveIngredients={onSaveCustomMeal ? (meal) => onSaveCustomMeal({
                      name: meal.name,
                      cal: meal.cal,
                      p: meal.p,
                      c: meal.c,
                      f: meal.f,
                      serves: meal.serves,
                      ingredients: meal.ingredients,
                    }) : undefined}
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
                onLog={onLogRecipe}
              />
            ))}
            <div style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: T.inkSoft,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              margin: "12px 0 6px",
            }}
            >
              Pantry staples
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setPantryGroup("all")}
                style={{
                  fontFamily: F,
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: `1.5px solid ${pantryGroup === "all" ? T.accent : T.border}`,
                  background: pantryGroup === "all" ? T.accentSoft : "#fff",
                  color: pantryGroup === "all" ? T.accentDeep : T.inkSoft,
                  cursor: "pointer",
                }}
              >
                All
              </button>
              {PANTRY_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setPantryGroup(g.id)}
                  style={{
                    fontFamily: F,
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: "5px 10px",
                    borderRadius: 999,
                    border: `1.5px solid ${pantryGroup === g.id ? T.accent : T.border}`,
                    background: pantryGroup === g.id ? T.accentSoft : "#fff",
                    color: pantryGroup === g.id ? T.accentDeep : T.inkSoft,
                    cursor: "pointer",
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {pantryVisible.map((r) => (
              <LoggableMealRow
                key={r.name}
                meal={r}
                via="recipe"
                onLog={onLogRecipe}
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
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, marginBottom: 6, letterSpacing: 0.3 }}>
                Meal
              </div>
              <SlotChips value={logSlot} onChange={setLogSlot} />
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

        {estimateDraft && (
          <div style={{ marginTop: 12, background: T.accentSoft, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.accentDeep, marginBottom: 8 }}>
              Review &amp; edit, then save
            </div>
            {snapItems.length > 0 && (
              <div
                className="mam-h-scroll"
                style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                marginBottom: 10,
                WebkitOverflowScrolling: "touch",
              }}
              >
                {snapItems.map((item, idx) => (
                  <div
                    key={`review-${item.previewUrl}-${idx}`}
                    style={{
                      flex: "0 0 auto",
                      width: snapItems.length === 1 ? "100%" : 88,
                      height: snapItems.length === 1 ? 120 : 88,
                      borderRadius: 10,
                      overflow: "hidden",
                      border: `1px solid ${T.border}`,
                      background: "#fff",
                    }}
                  >
                    <img
                      src={item.previewUrl}
                      alt={idx === 0 ? "Meal photo for this estimate" : `Extra photo ${idx + 1}`}
                      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ))}
              </div>
            )}
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
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, marginBottom: 6, letterSpacing: 0.3 }}>
                Meal
              </div>
              <SlotChips value={logSlot} onChange={setLogSlot} compact />
            </div>
            {estimateDraft.tip && (
              <div style={{ fontSize: 13, color: T.accentDeep, lineHeight: 1.5, marginBottom: 10 }}>
                💬 {estimateDraft.tip}
              </div>
            )}
            {/* Edit exactly what drove the estimate — Describe text, or the
                Snap note — then re-run. Fixes the "came back light, but I
                can't change what I wrote" feedback. */}
            <div style={{ marginTop: 4, paddingTop: 10, borderTop: `1px dashed ${T.border}` }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, marginBottom: 6, letterSpacing: 0.3 }}>
                {estimateDraft.sourceKind === "photo" ? "Your note" : "What you wrote"}
              </div>
              <textarea
                value={estimateDraft.sourceText || ""}
                onChange={(ev) => setEstimateDraft((d) => ({
                  ...d,
                  sourceText: ev.target.value.slice(0, estimateDraft.sourceKind === "photo" ? 400 : DESCRIBE_MAX),
                }))}
                placeholder={
                  estimateDraft.sourceKind === "photo"
                    ? "e.g. about 6 oz chicken, cooked in 1 tsp olive oil — or anything you added"
                    : "Add anything you missed — portions, oil, a side…"
                }
                disabled={busy}
                rows={estimateDraft.sourceKind === "photo" ? 2 : 3}
                maxLength={estimateDraft.sourceKind === "photo" ? 400 : DESCRIBE_MAX}
                style={{
                  width: "100%",
                  padding: "9px 11px",
                  fontSize: 14,
                  lineHeight: 1.45,
                  border: `1.5px solid ${T.border}`,
                  borderRadius: 10,
                  fontFamily: F,
                  background: "#fff",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                <button
                  type="button"
                  disabled={!canReEstimate}
                  onClick={reEstimateFromSource}
                  style={{
                    fontFamily: F,
                    fontSize: 12.5,
                    fontWeight: 700,
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1.5px solid ${T.accent}`,
                    background: canReEstimate ? T.accent : "#D9C4CE",
                    color: "#fff",
                    cursor: canReEstimate ? "pointer" : "default",
                    whiteSpace: "nowrap",
                  }}
                >
                  {busy ? "Re-reading…" : "Update estimate"}
                </button>
                <span style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.4 }}>
                  {sourceDirty
                    ? (estimateDraft.sourceKind === "photo"
                      ? "We'll re-read the same photo with this note."
                      : "We'll redo the estimate with your edits.")
                    : "Edit above if the estimate looks light or you missed something."}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
              <Btn small onClick={saveEstimateDraft}>
                {onToday ? "Save to today" : `Save to ${formatLongDay(date)}`}
              </Btn>
              <button
                type="button"
                onClick={() => {
                  setEstimateDraft(null);
                  clearEstimateInputs();
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
        <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 4 }}>
          {onToday ? "Today's log" : `${formatLongDay(date)} log`}
        </div>
        {hasAnyEntries && (
          <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 10 }}>
            Grouped by meal — tap any item to move or edit.
          </div>
        )}

        {!hasAnyEntries ? (
          <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6, padding: "6px 0 10px" }}>
            Nothing logged this day. Snap a plate or menu, describe, or tap a recipe.
          </div>
        ) : (
          <>
            {SLOT_SECTION_ORDER.map((slotKey) => {
              const list = slotBuckets[slotKey] || [];
              if (!list.length) return null;
              return (
                <div key={slotKey} style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      color: T.accentDeep,
                      margin: "4px 0 6px",
                    }}
                  >
                    {SLOT_LABEL[slotKey] || slotKey}
                  </div>
                  {list.map((e) =>
                    editingId === e.id && draft ? (
                      <div
                        key={e.id}
                        style={{
                          padding: "10px",
                          border: `1px solid ${T.border}`,
                          background: T.accentSoft,
                          borderRadius: 12,
                          marginBottom: 6,
                        }}
                      >
                        <input
                          value={draft.name}
                          onChange={(ev) => setDraft((d) => ({ ...d, name: ev.target.value, handTweaked: true }))}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: 14,
                            fontWeight: 600,
                            border: `1.5px solid ${T.border}`,
                            borderRadius: 10,
                            fontFamily: F,
                            marginBottom: 8,
                            boxSizing: "border-box",
                          }}
                        />
                        <div style={{ marginBottom: 8 }}>
                          <SlotChips
                            value={draft.slot}
                            onChange={(s) => setDraft((d) => ({ ...d, slot: s }))}
                            compact
                          />
                        </div>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 10,
                          flexWrap: "wrap",
                        }}
                        >
                          <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>Servings</span>
                          <ServingStepper
                            value={draft.editServings || 1}
                            onChange={applyEditServings}
                            compact
                          />
                          <span style={{ fontSize: 11.5, color: T.inkSoft }}>
                            Scales this log from what’s currently saved as 1×
                          </span>
                        </div>
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
                        {onEstimateRefine && (
                          <LogMealRefine
                            onRefine={refineRowEstimate}
                            busy={rowRefineBusy}
                            error={rowRefineError}
                          />
                        )}
                        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}>
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
                              color: AI_VIA.has(e.via) ? T.accentDeep : T.inkSoft,
                            }}
                          >
                            {VIA_LABEL[e.via] || "adjusted by you"}
                            {AI_VIA.has(e.via) ? " · tap to adjust" : " · tap to edit"}
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, color: T.inkSoft, whiteSpace: "nowrap" }}>
                          {Math.round(e.cal)} cal · P {Math.round(e.p)}g · C {Math.round(e.c)}g · F {Math.round(e.f)}g
                        </div>
                        <span style={{ color: T.inkSoft, fontSize: 15 }}>›</span>
                      </button>
                    ),
                  )}
                </div>
              );
            })}

            {macros && (
              <>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
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
