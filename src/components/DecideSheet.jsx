import { useEffect, useMemo, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn } from "./ui";
import { SlotChips } from "./SlotChips";
import { ServingStepper } from "../utils/servings";
import { DECIDE_COPY, DECIDE_SLOT_LABEL, knowLaterCopy } from "../content/decideVoice";
import { decideLogFromCard } from "../utils/decideScale";
import { withRecipeDetail } from "../content/recipeDetails";
import { RECIPES, PANTRY_ITEMS } from "../content/data";
import { addDaysIso } from "../utils/dates";
import { mealFitsRemaining } from "../utils/eatingOutImpact";
import { normalizeSlot } from "../utils/mealSlots";
import {
  attachCoachContext,
  bandsFromMacros,
  budgetAsRemaining,
  budgetSentence,
  coachRead,
  computeSlotBudget,
  decidePencilForSlot,
  defaultDecideSlot,
  deriveMealShares,
  isOverDay,
  laterSlotAsBudget,
  loggedSlotsFromEntries,
} from "../utils/decideBudget";
import { dislikeTokens, prefsLine, slotPrefText, tokenizeLikes } from "../utils/decidePrefs";
import { EATING_OUT_FLAG, KITCHEN_FLAG, rankBankCards } from "../utils/decideRank";
import { clearDecideSession, decideTrack, loadDecideSession, saveDecideSession } from "../lib/decideEvents";

function historyNames(mealHistoryByDate, { slot, sinceIso, dates } = {}) {
  const any = [];
  const slotted = [];
  for (const [date, entries] of Object.entries(mealHistoryByDate || {})) {
    if (sinceIso && date < sinceIso) continue;
    if (dates && !dates.includes(date)) continue;
    for (const e of entries || []) {
      if (!e?.name) continue;
      any.push(e.name);
      if (slot && normalizeSlot(e.slot) === slot) slotted.push(e.name);
    }
  }
  return { anyHistoryNames: any, slotHistoryNames: slotted };
}

function CompactCard({ card, onLog, onOpen, logging }) {
  if (card.kind === "soft") {
    return (
      <button
        type="button"
        onClick={() => onOpen?.(card)}
        style={{
          width: "100%",
          textAlign: "left",
          border: `1px dashed ${T.border}`,
          borderRadius: 16,
          padding: "12px 14px",
          background: T.accentSoft,
          fontFamily: F,
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.45 }}>{card.text}</div>
      </button>
    );
  }
  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        padding: "10px 12px 10px",
        background: "#FFFCFD",
      }}
    >
      <button
        type="button"
        onClick={() => onOpen?.(card)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: F,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, lineHeight: 1.25 }}>{card.title || card.name}</div>
          <span style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: T.sage,
            background: T.sageSoft,
            borderRadius: 8,
            padding: "2px 7px",
            flexShrink: 0,
          }}
          >
            {card.tag}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 5 }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: T.accent,
            marginTop: 5,
            flexShrink: 0,
          }}
          />
          <div style={{ fontSize: 12.5, color: T.accentDeep, lineHeight: 1.35 }}>{card.knowsYou}</div>
        </div>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3, lineHeight: 1.35 }}>{card.reason}</div>
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>
          {Math.round(card.cal)} cal · P {Math.round(card.p)}g · C {Math.round(card.c)}g · F {Math.round(card.f)}g
        </div>
        <button
          type="button"
          onClick={() => onLog?.(card)}
          disabled={logging}
          style={{
            fontFamily: F,
            fontWeight: 700,
            fontSize: 13,
            background: T.accent,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "7px 14px",
            cursor: logging ? "default" : "pointer",
          }}
        >
          {DECIDE_COPY.logIt}
        </button>
      </div>
    </div>
  );
}

function ingredientLines(meal) {
  const detailed = withRecipeDetail(meal);
  const lines = Array.isArray(detailed.ingredients) ? detailed.ingredients : [];
  return lines.slice(0, 8).map((line) => {
    if (typeof line === "string") return line;
    return [line.amount, line.item || line.name].filter(Boolean).join(" ");
  }).filter(Boolean);
}

function stepLines(meal) {
  const detailed = withRecipeDetail(meal);
  return (Array.isArray(detailed.steps) ? detailed.steps : []).slice(0, 3);
}

export function DecideSheet({
  open,
  onClose,
  dateKey,
  now,
  macros,
  entries = [],
  plannedMeals = [],
  recipes = RECIPES,
  customMeals = [],
  pantryItems = PANTRY_ITEMS,
  profile,
  mealHistoryByDate = {},
  onLog,
  onPencil,
  onBrowseMeals,
  onOpenPrefs,
  entry = "bar",
}) {
  const openedAt = useRef(Date.now());
  const [slot, setSlot] = useState(() => defaultDecideSlot({
    now,
    loggedSlots: loggedSlotsFromEntries(entries),
  }));
  const [mode, setMode] = useState("pick");
  const [level, setLevel] = useState("list");
  const [detail, setDetail] = useState(null);
  const [detailServings, setDetailServings] = useState(1);
  const [pencilOpen, setPencilOpen] = useState(false);
  const [skipNames, setSkipNames] = useState([]);
  const [prefer, setPrefer] = useState(null);
  const [offset, setOffset] = useState(0);
  const [logging, setLogging] = useState(false);
  const [refineText, setRefineText] = useState("");
  const refines = useRef(0);

  const bands = useMemo(() => bandsFromMacros(macros), [macros]);
  const totals = useMemo(() => (entries || []).reduce((a, e) => ({
    cal: a.cal + (Number(e.cal) || 0),
    p: a.p + (Number(e.p) || 0),
    c: a.c + (Number(e.c) || 0),
    f: a.f + (Number(e.f) || 0),
  }), { cal: 0, p: 0, c: 0, f: 0 }), [entries]);
  const loggedSlots = useMemo(() => loggedSlotsFromEntries(entries), [entries]);
  const shares = useMemo(() => deriveMealShares(mealHistoryByDate), [mealHistoryByDate]);

  const budget = useMemo(() => {
    if (!bands) return null;
    return attachCoachContext(computeSlotBudget({
      totals,
      bands,
      slot,
      plannedMeals,
      shares,
      loggedSlots,
    }), bands);
  }, [bands, totals, slot, plannedMeals, shares, loggedSlots]);

  const over = isOverDay(budget?.remaining);
  const coach = coachRead({ budget, remaining: budget?.remaining, slot, over });
  const laterSlot = budget?.laterSlots?.[0] || null;
  const laterPiece = laterSlot ? budget?.reserve?.bySlot?.[laterSlot] : null;

  const likes = useMemo(() => tokenizeLikes(slotPrefText(profile, slot)), [profile, slot]);
  const dislikes = useMemo(() => dislikeTokens(profile), [profile]);
  const prefs = prefsLine({
    allergens: profile?.allergens,
    foodAvoids: profile?.foodAvoids,
    likes,
  });

  const sinceIso = dateKey ? addDaysIso(dateKey, -28) : null;
  const hist = useMemo(
    () => historyNames(mealHistoryByDate, { slot, sinceIso }),
    [mealHistoryByDate, slot, sinceIso],
  );
  const recent = useMemo(
    () => historyNames(mealHistoryByDate, {
      dates: dateKey ? [dateKey, addDaysIso(dateKey, -1), addDaysIso(dateKey, -2)] : [],
    }),
    [mealHistoryByDate, dateKey],
  );
  const loggedTodayNames = (entries || []).map((e) => e.name).filter(Boolean);
  const pencilled = decidePencilForSlot(plannedMeals, slot);

  const bankMeals = useMemo(
    () => (recipes || []).map((r) => withRecipeDetail(r)),
    [recipes],
  );

  const ranked = useMemo(() => rankBankCards({
    bankMeals,
    myMeals: customMeals,
    pantryItems,
    budget,
    likes,
    dislikes,
    diet: profile?.diet,
    loggedTodayNames,
    loggedRecentNames: recent.anyHistoryNames,
    slotHistoryNames: hist.slotHistoryNames,
    anyHistoryNames: hist.anyHistoryNames,
    skipNames,
    prefer,
    offset,
    pencilled,
    over,
    slot,
  }), [
    bankMeals, customMeals, pantryItems, budget, likes, dislikes, profile?.diet,
    loggedTodayNames, recent.anyHistoryNames, hist.slotHistoryNames, hist.anyHistoryNames,
    skipNames, prefer, offset, pencilled, over, slot,
  ]);

  const laterBudget = laterSlot && bands
    ? laterSlotAsBudget(laterSlot, shares, bands)
    : null;
  const laterRanked = useMemo(() => {
    if (!laterBudget) return { cards: [], meals: [] };
    const slotBank = bankMeals.filter((m) => normalizeSlot(m.cat || m.slot) === laterSlot);
    const slotMine = (customMeals || []).filter((m) => normalizeSlot(m.slot || m.cat) === laterSlot);
    return rankBankCards({
      bankMeals: slotBank.length >= 3 ? slotBank : bankMeals,
      myMeals: slotMine.length ? slotMine : customMeals,
      pantryItems: laterSlot === "snack" ? pantryItems : [],
      budget: laterBudget,
      likes: tokenizeLikes(slotPrefText(profile, laterSlot)),
      dislikes,
      diet: profile?.diet,
      slot: laterSlot,
    });
  }, [laterBudget, bankMeals, customMeals, pantryItems, profile, laterSlot, dislikes]);

  useEffect(() => {
    if (!open) return;
    const saved = loadDecideSession(dateKey, slot);
    if (saved?.mode) setMode(saved.mode);
    openedAt.current = Date.now();
    decideTrack("decide_open", {
      slot,
      budgetCal: Math.round(budget?.cal || 0),
      pNeed: Math.round(budget?.pNeed || 0),
      entry,
      laterPencilled: Boolean(laterPiece?.meal),
    });
    decideTrack("decide_cards", {
      mode: "pick",
      count: ranked.meals.length,
      scaledCount: ranked.scaledCount,
      aiCall: false,
    });
    // open + cards once per open/slot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slot]);

  useEffect(() => {
    if (!open || !dateKey) return;
    saveDecideSession(dateKey, slot, { mode, skipNames, prefer, offset });
  }, [open, dateKey, slot, mode, skipNames, prefer, offset]);

  const dismiss = () => {
    decideTrack("decide_dismiss", {
      mode,
      cardsShown: ranked.meals.length,
      secondsOpen: Math.round((Date.now() - openedAt.current) / 1000),
      refines: refines.current,
    });
    onClose?.();
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !budget) return null;

  const changeSlot = (next) => {
    setSlot(next);
    setLevel("list");
    setDetail(null);
    setPencilOpen(false);
    setSkipNames([]);
    setPrefer(null);
    setOffset(0);
  };

  const logCard = async (card, { fromDetail = false, servings } = {}) => {
    if (!card || card.kind === "soft" || logging) return;
    setLogging(true);
    const scaled = decideLogFromCard(card, servings);
    try {
      const ok = await onLog?.({
        ...scaled,
        via: "decide_bank",
        slot,
      });
      if (ok === false) return;
      decideTrack("decide_log", {
        via: "decide_bank",
        mode,
        scale: scaled.servings,
        cardIndex: ranked.meals.findIndex((m) => m.name === card.name),
        fromDetail,
        secondsOpen: Math.round((Date.now() - openedAt.current) / 1000),
      });
      clearDecideSession(dateKey, slot);
      const nextLogged = new Set(loggedSlots);
      nextLogged.add(slot);
      const nextSlot = defaultDecideSlot({ now, loggedSlots: nextLogged });
      setSlot(nextSlot);
      setLevel("list");
      setDetail(null);
      setPencilOpen(false);
      setSkipNames([]);
      setOffset(0);
    } finally {
      setLogging(false);
    }
  };

  const pencilCard = async (card, forSlot, qtyOverride) => {
    await onPencil?.({ ...card, via: "decide" }, forSlot, qtyOverride);
    decideTrack("decide_pencil", { slot: forSlot, fromSlot: slot });
    setPencilOpen(false);
  };

  const openCard = (card) => {
    if (card.kind === "soft") {
      if (card.action === "browse") onBrowseMeals?.();
      else setMode("kitchen");
      return;
    }
    setDetail(card);
    setDetailServings(card.servings || 1);
    setLevel("detail");
    decideTrack("decide_detail", { mode, cardIndex: ranked.meals.findIndex((m) => m.name === card.name) });
  };

  const refine = (kind) => {
    refines.current += 1;
    decideTrack("decide_refine", { chip: kind, mode, askIndex: refines.current });
    if (kind === "none") {
      setSkipNames((prev) => [...prev, ...ranked.meals.map((m) => m.name)]);
      setOffset(0);
    } else if (kind === "lighter") setPrefer("lighter");
    else if (kind === "protein") setPrefer("protein");
  };

  const detailScaled = detail
    ? decideLogFromCard(detail, detailServings)
    : null;
  const detailFits = detailScaled
    ? mealFitsRemaining(detailScaled, budgetAsRemaining(budget))
    : false;

  return (
    <div
      data-decide-sheet="open"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={dismiss}
        style={{
          border: "none",
          background: "rgba(51,39,46,0.35)",
          flex: 1,
          cursor: "pointer",
        }}
      />
      <div
        role="dialog"
        aria-label={DECIDE_COPY.title}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          height: "90vh",
          background: "#fff",
          borderRadius: "28px 28px 0 0",
          padding: "8px 16px 18px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -12px 40px rgba(51,39,46,0.12)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ width: 40, height: 5, borderRadius: 3, background: T.track, margin: "2px auto 10px" }} />
        {level === "detail" && detail ? (
          <div style={{ overflow: "auto", flex: 1 }}>
            <button
              type="button"
              onClick={() => { setLevel("list"); setDetail(null); }}
              style={{
                border: "none",
                background: "none",
                fontFamily: F,
                fontWeight: 700,
                color: T.accentDeep,
                padding: 0,
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              ← Back
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <h3 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: 0 }}>{detail.name}</h3>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.sage }}>{detail.tag}</span>
            </div>
            <div style={{ fontSize: 13.5, color: T.accentDeep, marginTop: 6 }}>{detail.knowsYou}</div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: T.ink, fontSize: 13.5, lineHeight: 1.45 }}>
              {ingredientLines(detail).map((line) => <li key={line}>{line}</li>)}
            </ul>
            {stepLines(detail).map((step, i) => (
              <p key={i} style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.45, margin: "8px 0 0" }}>{step}</p>
            ))}
            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <ServingStepper value={detailServings} onChange={setDetailServings} />
              <div style={{ fontSize: 12.5, color: T.inkSoft, fontWeight: 600 }}>
                {Math.round(detailScaled.cal)} cal · P {Math.round(detailScaled.p)}g
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: detailFits ? T.sage : T.inkSoft, marginTop: 6 }}>
              {detailFits ? "Fits this meal’s budget" : "A touch over this meal’s budget"}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <Btn small onClick={() => logCard(detail, { fromDetail: true, servings: detailServings })} disabled={logging}>
                {DECIDE_COPY.logIt}
              </Btn>
              <Btn small ghost onClick={() => pencilCard(detail, slot, detailServings)}>
                {DECIDE_COPY.pencilIn}
              </Btn>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <h3 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: 0 }}>{DECIDE_COPY.title}</h3>
              <div style={{ fontSize: 11, color: T.inkSoft, textAlign: "right", maxWidth: 140, lineHeight: 1.3 }}>
                {DECIDE_COPY.headerKnows}
              </div>
            </div>
            <p style={{ fontFamily: F, fontSize: 14.5, lineHeight: 1.45, margin: "8px 0 0", color: T.ink }}>
              {coach.line1}
            </p>
            {coach.line2 ? (
              <p style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, margin: "4px 0 0", color: T.inkSoft }}>
                {coach.line2}
              </p>
            ) : null}
            <div style={{ marginTop: 10 }}>
              <SlotChips value={slot} onChange={changeSlot} fill />
            </div>
            <div style={{
              marginTop: 8,
              fontSize: 12.5,
              color: T.inkSoft,
              lineHeight: 1.45,
              padding: "8px 10px",
              background: "#F8F3F5",
              borderRadius: 12,
            }}
            >
              {budgetSentence(budget)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 10px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft }}>
                  {DECIDE_COPY.forSlot} {DECIDE_SLOT_LABEL[slot] || slot}
                </div>
                <div style={{ fontFamily: FD, fontSize: 20, marginTop: 2 }}>{Math.round(budget.cal)} cal</div>
                <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>
                  P {Math.round(budget.pNeed)}g to range · C {Math.round(budget.c)}g · F {Math.round(budget.f)}g
                </div>
              </div>
              {laterSlot ? (
                <button
                  type="button"
                  onClick={() => setPencilOpen((v) => !v)}
                  style={{
                    textAlign: "left",
                    border: laterPiece?.meal ? `1px solid ${T.border}` : `1px dashed ${T.border}`,
                    borderRadius: 12,
                    padding: "8px 10px",
                    background: "#F8F3F5",
                    fontFamily: F,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft }}>
                    {laterPiece?.meal
                      ? `${DECIDE_SLOT_LABEL[laterSlot]}, ${DECIDE_COPY.pencilledBox}`
                      : `${DECIDE_COPY.savedFor} ${DECIDE_SLOT_LABEL[laterSlot]}`}
                  </div>
                  <div style={{ fontFamily: FD, fontSize: 20, marginTop: 2 }}>
                    {laterPiece?.meal ? laterPiece.meal.name : `${Math.round(laterPiece?.cal || 0)} cal`}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>
                    {laterPiece?.meal
                      ? `${Math.round(laterPiece.cal)} cal · P ${Math.round(laterPiece.p)}g`
                      : `P ${Math.round(laterPiece?.p || 0)}g · C ${Math.round(laterPiece?.c || 0)}g · F ${Math.round(laterPiece?.f || 0)}g`}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.accentDeep, fontWeight: 700, marginTop: 3 }}>
                    {laterPiece?.meal ? DECIDE_COPY.change : knowLaterCopy(laterSlot)}
                  </div>
                </button>
              ) : (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 10px", background: T.sageSoft }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.sage }}>{DECIDE_COPY.afterThis}</div>
                  <div style={{ fontFamily: FD, fontSize: 20, marginTop: 2 }}>{DECIDE_COPY.doneToday}</div>
                </div>
              )}
            </div>
            {pencilOpen && laterSlot ? (
              <div style={{ marginTop: 8, border: `1px solid ${T.border}`, borderRadius: 14, padding: "8px 10px", background: "#FFF9FB" }}>
                {(laterRanked.meals || []).slice(0, 3).map((m) => (
                  <div key={m.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderTop: `1px solid ${T.border}` }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.title || m.name}</div>
                      <div style={{ fontSize: 11.5, color: T.inkSoft }}>{m.knowsYou} · {Math.round(m.cal)} cal · P {Math.round(m.p)}g</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => pencilCard(m, laterSlot)}
                      style={{
                        fontFamily: F,
                        fontWeight: 700,
                        fontSize: 12,
                        color: T.accentDeep,
                        background: T.accentSoft,
                        border: "none",
                        borderRadius: 999,
                        padding: "6px 10px",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {DECIDE_COPY.pencilIn}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPencilOpen(false)}
                  style={{
                    border: "none",
                    background: "none",
                    fontFamily: F,
                    fontWeight: 700,
                    fontSize: 12.5,
                    color: T.inkSoft,
                    cursor: "pointer",
                    padding: "6px 0 2px",
                  }}
                >
                  {DECIDE_COPY.notSureYet}
                </button>
              </div>
            ) : null}
            {prefs ? (
              <button
                type="button"
                onClick={() => onOpenPrefs?.()}
                style={{
                  border: "none",
                  background: "none",
                  fontFamily: F,
                  fontSize: 12,
                  color: T.inkSoft,
                  textAlign: "left",
                  padding: "8px 0 0",
                  cursor: "pointer",
                  lineHeight: 1.4,
                }}
              >
                {prefs}
              </button>
            ) : null}
            <div style={{
              display: "flex",
              gap: 4,
              marginTop: 10,
              background: "#F5EDF0",
              padding: 4,
              borderRadius: 14,
            }}
            >
              {[
                ["pick", DECIDE_COPY.pickForMe],
                ["kitchen", DECIDE_COPY.kitchen],
                ["out", DECIDE_COPY.eatingOut],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMode(id);
                    decideTrack("decide_mode", { mode: id });
                  }}
                  style={{
                    flex: 1,
                    border: "none",
                    borderRadius: 11,
                    padding: "8px 0",
                    fontFamily: F,
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: "pointer",
                    background: mode === id ? "#fff" : "transparent",
                    color: mode === id ? T.accentDeep : T.inkSoft,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ overflow: "auto", flex: 1, marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {mode !== "pick" && ((mode === "kitchen" && !KITCHEN_FLAG) || (mode === "out" && !EATING_OUT_FLAG)) ? (
                <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, padding: "8px 2px" }}>
                  {DECIDE_COPY.comingSoon}
                </div>
              ) : (
                ranked.cards.map((card, i) => (
                  <CompactCard
                    key={card.name || card.text || i}
                    card={card}
                    onLog={(c) => logCard(c)}
                    onOpen={openCard}
                    logging={logging}
                  />
                ))
              )}
              {mode === "pick" ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {[
                    ["none", DECIDE_COPY.noneOfThese],
                    ["lighter", DECIDE_COPY.lighter],
                    ["protein", DECIDE_COPY.moreProtein],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => refine(id)}
                      style={{
                        fontFamily: F,
                        fontSize: 12,
                        fontWeight: 700,
                        color: T.accentDeep,
                        background: T.accentSoft,
                        border: "none",
                        borderRadius: 999,
                        padding: "6px 10px",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  <input
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && refineText.trim()) {
                        setSkipNames((prev) => [...prev, refineText.trim()]);
                        setRefineText("");
                        refine("free");
                      }
                    }}
                    placeholder="Something else"
                    style={{
                      flex: 1,
                      minWidth: 120,
                      border: `1px solid ${T.border}`,
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontFamily: F,
                      fontSize: 12.5,
                    }}
                  />
                </div>
              ) : null}
            </div>
            <button
              type="button"
              data-decide-dismiss="back"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dismiss();
              }}
              style={{
                border: "none",
                background: "none",
                fontFamily: F,
                fontWeight: 700,
                fontSize: 13.5,
                color: T.inkSoft,
                padding: "10px 0 2px",
                cursor: "pointer",
                flexShrink: 0,
                zIndex: 2,
              }}
            >
              {DECIDE_COPY.back}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
