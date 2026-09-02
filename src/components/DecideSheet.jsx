import { useEffect, useMemo, useRef, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn, MealSearchInput } from "./ui";
import { SlotChips } from "./SlotChips";
import { ServingStepper } from "../utils/servings";
import { DECIDE_COPY, DECIDE_SLOT_LABEL, decideNextCopy, knowLaterCopy, snackRoomCopy } from "../content/decideVoice";
import { SLOT_CHIP } from "../utils/mealSlots";
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
  decideTakenSlots,
  defaultDecideSlot,
  deriveMealShares,
  isOverDay,
  laterSlotAsBudget,
  loggedSlotsFromEntries,
  nextDecideSlot,
} from "../utils/decideBudget";
import { dislikeTokens, prefsLine, slotPrefText, tokenizeLikes } from "../utils/decidePrefs";
import { EATING_OUT_FLAG, KITCHEN_FLAG, rankBankCards } from "../utils/decideRank";
import { filterMealsByQuery } from "../utils/mealSearch";
import {
  clearDecideSession,
  decideTrack,
  loadDecideSession,
  loadDecideSnackCount,
  saveDecideSession,
  saveDecideSnackCount,
} from "../lib/decideEvents";
import { markDecideScroll, ownPointerClick, trapDecideEvent } from "../lib/decidePointerTrap";

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

function CompactCard({ card, onLog, onPencil, onOpen, logging, featured = false }) {
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
      data-decide-featured-card={featured ? "1" : undefined}
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        padding: featured ? "16px 16px 14px" : "10px 12px 10px",
        background: T.card,
        flex: featured ? 1 : undefined,
        minHeight: featured ? 200 : undefined,
        display: featured ? "flex" : undefined,
        flexDirection: featured ? "column" : undefined,
        justifyContent: featured ? "space-between" : undefined,
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
          <div style={{
            fontFamily: featured ? FD : F,
            fontSize: featured ? 22 : 15,
            fontWeight: featured ? 400 : 700,
            color: T.ink,
            lineHeight: 1.25,
          }}
          >
            {card.title || card.name}
          </div>
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
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: featured ? 10 : 5 }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: T.accent,
            marginTop: 5,
            flexShrink: 0,
          }}
          />
          <div style={{ fontSize: featured ? 14 : 12.5, color: T.accentDeep, lineHeight: 1.4 }}>{card.knowsYou}</div>
        </div>
        <div style={{ fontSize: featured ? 14 : 12.5, color: T.inkSoft, marginTop: featured ? 8 : 3, lineHeight: 1.4 }}>{card.reason}</div>
        {featured ? (
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.accentDeep, marginTop: 10 }}>
            {DECIDE_COPY.seeRecipe}
          </div>
        ) : null}
      </button>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: featured ? "flex-end" : "center",
        gap: 10,
        marginTop: featured ? 16 : 8,
        flexWrap: "wrap",
      }}
      >
        <div style={{ fontSize: featured ? 13 : 11.5, color: T.inkSoft, fontWeight: 600 }}>
          {Math.round(card.cal)} cal · {macrosLine(card.p, card.c, card.f)}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {featured && onPencil ? (
            <button
              type="button"
              onClick={() => onPencil?.(card)}
              style={{
                fontFamily: F,
                fontWeight: 700,
                fontSize: 13,
                background: T.accentSoft,
                color: T.accentDeep,
                border: "none",
                borderRadius: 999,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              {DECIDE_COPY.pencilIn}
            </button>
          ) : null}
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
              padding: featured ? "8px 14px" : "7px 14px",
              cursor: logging ? "default" : "pointer",
            }}
          >
            {DECIDE_COPY.logIt}
          </button>
        </div>
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

function macrosLine(p, c, f) {
  return `P ${Math.round(p || 0)}g · C ${Math.round(c || 0)}g · F ${Math.round(f || 0)}g`;
}

function SnackRoomStepper({ count, onChange, piece, onTurnOff }) {
  const label = snackRoomCopy(count);
  const stepBtn = (disabled) => ({
    width: 32,
    height: 32,
    borderRadius: 999,
    border: `1px solid ${T.border}`,
    background: disabled ? T.track : T.card,
    color: disabled ? T.inkSoft : T.ink,
    fontFamily: F,
    fontWeight: 700,
    fontSize: 18,
    lineHeight: 1,
    cursor: disabled ? "default" : "pointer",
  });
  return (
    <div
      data-snack-room
      data-snack-include="on"
      aria-label={label}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        marginTop: 8,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: "8px 10px",
        background: T.card,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <button
          type="button"
          onClick={onTurnOff}
          style={{
            border: "none",
            background: "none",
            padding: 0,
            fontFamily: F,
            fontSize: 12,
            fontWeight: 700,
            color: T.accentDeep,
            cursor: "pointer",
          }}
        >
          {DECIDE_COPY.includeSnacksOff}
        </button>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
          <span>{label}</span>
          {" · "}
          {Math.round(piece?.cal || 0)} cal
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          aria-label="Fewer snacks"
          disabled={count <= 0}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(-1);
          }}
          style={stepBtn(count <= 0)}
        >
          −
        </button>
        <span data-snack-room-count style={{ fontFamily: FD, fontSize: 18, minWidth: 16, textAlign: "center" }}>
          {count}
        </span>
        <button
          type="button"
          aria-label="More snacks"
          disabled={count >= 4}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(1);
          }}
          style={stepBtn(count >= 4)}
        >
          +
        </button>
      </div>
    </div>
  );
}

function SnackIncludeToggle({ on, onTurnOn }) {
  if (on) return null;
  return (
    <button
      type="button"
      data-snack-include="off"
      onClick={onTurnOn}
      style={{
        marginTop: 8,
        width: "100%",
        textAlign: "left",
        border: `1px dashed ${T.border}`,
        background: T.card,
        borderRadius: 12,
        padding: "8px 10px",
        fontFamily: F,
        fontSize: 13,
        fontWeight: 700,
        color: T.inkSoft,
        cursor: "pointer",
      }}
    >
      {DECIDE_COPY.includeSnacks}
    </button>
  );
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
  onLogged,
  entry = "bar",
  variant = "sheet",
  initialSlot,
}) {
  const openedAt = useRef(Date.now());
  const page = variant === "page";
  const [slot, setSlot] = useState(() => initialSlot || defaultDecideSlot({
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
  const [planQuery, setPlanQuery] = useState("");
  const [snackCount, setSnackCount] = useState(() => loadDecideSnackCount(dateKey));
  const [afterMove, setAfterMove] = useState(null);
  const [takenExtra, setTakenExtra] = useState([]);
  const refines = useRef(0);
  const snackLock = useRef(0);
  const lastFocusSlot = useRef(initialSlot);

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
      snackCount,
    }), bands);
  }, [bands, totals, slot, plannedMeals, shares, loggedSlots, snackCount]);

  const over = isOverDay(budget?.remaining);
  const coach = coachRead({ budget, remaining: budget?.remaining, slot, over });
  const laterSlot = budget?.laterSlots?.[0] || null;
  const laterPiece = laterSlot ? budget?.reserve?.bySlot?.[laterSlot] : null;
  const takenNow = decideTakenSlots({
    entries,
    plannedMeals,
    extraSlots: takenExtra,
  });
  const laterCtaSlot = (budget?.laterSlots || []).find((s) => !takenNow.has(s)) || null;
  const laterCtaPiece = laterCtaSlot ? budget?.reserve?.bySlot?.[laterCtaSlot] : null;
  const nextOpenSlot = nextDecideSlot({
    now,
    entries,
    plannedMeals,
    extraTaken: takenExtra,
  });

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

  const laterBudget = laterCtaSlot && bands
    ? laterSlotAsBudget(laterCtaSlot, shares, bands)
    : null;
  const laterRanked = useMemo(() => {
    if (!laterBudget || !laterCtaSlot) return { cards: [], meals: [] };
    const slotBank = bankMeals.filter((m) => normalizeSlot(m.cat || m.slot) === laterCtaSlot);
    const slotMine = (customMeals || []).filter((m) => normalizeSlot(m.slot || m.cat) === laterCtaSlot);
    return rankBankCards({
      bankMeals: slotBank.length >= 3 ? slotBank : bankMeals,
      myMeals: slotMine.length ? slotMine : customMeals,
      pantryItems: laterCtaSlot === "snack" ? pantryItems : [],
      budget: laterBudget,
      likes: tokenizeLikes(slotPrefText(profile, laterCtaSlot)),
      dislikes,
      diet: profile?.diet,
      slot: laterCtaSlot,
    });
  }, [laterBudget, bankMeals, customMeals, pantryItems, profile, laterCtaSlot, dislikes]);

  useEffect(() => {
    if (!initialSlot || initialSlot === lastFocusSlot.current) return;
    lastFocusSlot.current = initialSlot;
    setSlot(initialSlot);
    setLevel("list");
    setDetail(null);
    setPencilOpen(false);
    setAfterMove(null);
    setTakenExtra([]);
    setPlanQuery("");
  }, [initialSlot]);

  useEffect(() => {
    if (!open) return;
    const saved = loadDecideSession(dateKey, slot);
    if (saved?.mode === "pick") setMode("pick");
    else if (saved?.mode === "kitchen" && KITCHEN_FLAG) setMode("kitchen");
    else if (saved?.mode === "out" && EATING_OUT_FLAG) setMode("out");
    else if (saved?.mode) setMode("pick");
    // Restore snack room from the day cache — never reset to 0/1 on refine remount.
    const kept = loadDecideSnackCount(dateKey, snackCount);
    if (kept !== snackCount) setSnackCount(kept);
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
    const persistMode = (
      (mode === "kitchen" && !KITCHEN_FLAG) || (mode === "out" && !EATING_OUT_FLAG)
    ) ? "pick" : mode;
    saveDecideSession(dateKey, slot, { mode: persistMode, skipNames, prefer, offset });
  }, [open, dateKey, slot, mode, skipNames, prefer, offset]);

  const dismiss = () => {
    decideTrack("decide_dismiss", {
      mode,
      cardsShown: ranked.meals.length,
      secondsOpen: Math.round((Date.now() - openedAt.current) / 1000),
      refines: refines.current,
    });
    // Close only. Never delete / undo a meal_log from Esc or Back.
    onClose?.();
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    if (!open) return undefined;
    const mark = () => markDecideScroll();
    window.addEventListener("scroll", mark, true);
    window.addEventListener("wheel", mark, { capture: true, passive: true });
    window.addEventListener("touchmove", mark, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", mark, true);
      window.removeEventListener("wheel", mark, true);
      window.removeEventListener("touchmove", mark, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (levelRef.current === "detail") {
        setLevel("list");
        setDetail(null);
        return;
      }
      dismissRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const searchHits = useMemo(() => {
    const q = String(planQuery || "").trim();
    if (!q) return [];
    const pool = [...bankMeals, ...(customMeals || [])];
    return filterMealsByQuery(pool, q).slice(0, 12);
  }, [planQuery, bankMeals, customMeals]);

  if (!open || !budget) return null;

  const changeSlot = (next) => {
    setSlot(next);
    setLevel("list");
    setDetail(null);
    setPencilOpen(false);
    setSkipNames([]);
    setPrefer(null);
    setOffset(0);
    setAfterMove(null);
    setTakenExtra([]);
    setPlanQuery("");
  };

  const setSnackTo = (next) => {
    const clamped = Math.max(0, Math.min(4, next));
    setSnackCount(clamped);
    saveDecideSnackCount(dateKey, clamped);
  };

  const stepSnack = (delta) => {
    const nowMs = Date.now();
    if (nowMs - snackLock.current < 280) return;
    snackLock.current = nowMs;
    setSnackCount((n) => {
      const next = Math.max(0, Math.min(4, n + delta));
      saveDecideSnackCount(dateKey, next);
      return next;
    });
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
      const nextSlot = nextDecideSlot({
        now,
        entries,
        plannedMeals,
        extraTaken: [slot],
      });
      setLevel("list");
      setDetail(null);
      setPencilOpen(false);
      setSkipNames([]);
      setOffset(0);
      setPlanQuery("");
      if (page) {
        onLogged?.({ slot, nextSlot });
        return;
      }
      if (nextSlot && nextSlot !== slot) setSlot(nextSlot);
      setAfterMove(nextSlot && nextSlot !== slot ? { kind: "logged", nextSlot } : null);
    } finally {
      setLogging(false);
    }
  };

  const pencilCard = async (card, forSlot, qtyOverride) => {
    await onPencil?.({ ...card, via: "decide" }, forSlot, qtyOverride);
    decideTrack("decide_pencil", { slot: forSlot, fromSlot: slot });
    setPencilOpen(false);
    setLevel("list");
    setDetail(null);
    setPlanQuery("");
    setTakenExtra([forSlot]);
    const nextSlot = nextDecideSlot({
      now,
      entries,
      plannedMeals,
      extraTaken: [forSlot],
    });
    setAfterMove(nextSlot && nextSlot !== forSlot ? { kind: "pencilled", nextSlot } : null);
  };

  const openCard = (card) => {
    if (card.kind === "soft") {
      if (card.action === "browse") onBrowseMeals?.();
      else if (card.action === "kitchen" && KITCHEN_FLAG) setMode("kitchen");
      else onBrowseMeals?.();
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
    if (kind === "none" || kind === "lighter" || kind === "protein") {
      setSkipNames((prev) => [...prev, ...ranked.meals.map((m) => m.name)]);
      setOffset(0);
    }
    if (kind === "lighter") setPrefer("lighter");
    else if (kind === "protein") setPrefer("protein");
  };

  const detailScaled = detail
    ? decideLogFromCard(detail, detailServings)
    : null;
  const detailFits = detailScaled
    ? mealFitsRemaining(detailScaled, budgetAsRemaining(budget))
    : false;

  const searching = Boolean(String(planQuery || "").trim());
  const featuredMeal = searching
    ? null
    : (ranked.cards || []).find((c) => c && c.kind !== "soft");
  const showModeSwitch = (KITCHEN_FLAG || EATING_OUT_FLAG);

  return (
    <div
      data-decide-sheet={page ? "page" : "open"}
      onPointerDown={trapDecideEvent}
      onPointerUp={trapDecideEvent}
      onClick={trapDecideEvent}
      onTouchStart={trapDecideEvent}
      onTouchEnd={trapDecideEvent}
      style={page ? {
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: 1,
        overflow: "hidden",
        background: T.bg,
        pointerEvents: "auto",
        position: "relative",
        zIndex: 4,
        isolation: "isolate",
      } : {
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        overflow: "hidden",
        pointerEvents: "auto",
      }}
    >
      {page ? null : (
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
      )}
      <div
        role={page ? "region" : "dialog"}
        aria-label={DECIDE_COPY.title}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={trapDecideEvent}
        onPointerUp={trapDecideEvent}
        onClick={trapDecideEvent}
        onTouchStart={trapDecideEvent}
        onTouchEnd={trapDecideEvent}
        style={page ? {
          minHeight: 0,
          flex: 1,
          background: T.bg,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          pointerEvents: "auto",
        } : {
          height: "90vh",
          maxHeight: "90vh",
          minHeight: 0,
          flexShrink: 0,
          background: T.bg,
          borderRadius: "28px 28px 0 0",
          padding: "8px 16px 0",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 -12px 40px rgba(51,39,46,0.12)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {page ? null : (
          <div style={{ width: 40, height: 5, borderRadius: 3, background: T.track, margin: "2px auto 10px", flexShrink: 0 }} />
        )}
        {level === "detail" && detail ? (
          <div style={{ overflow: "auto", flex: 1, minHeight: 0, paddingBottom: 18 }}>
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
                {Math.round(detailScaled.cal)} cal · {macrosLine(detailScaled.p, detailScaled.c, detailScaled.f)}
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
            <div style={{ flexShrink: 0 }}>
            {page ? (
              <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.35, marginBottom: 2 }}>
                {DECIDE_COPY.headerKnows}
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <h3 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: 0 }}>{DECIDE_COPY.title}</h3>
                <div style={{ fontSize: 11, color: T.inkSoft, textAlign: "right", maxWidth: 140, lineHeight: 1.3 }}>
                  {DECIDE_COPY.headerKnows}
                </div>
              </div>
            )}
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
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
            }}
            >
              {budgetSentence(budget)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <div data-decide-slot-budget style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 10px", background: T.card }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft }}>
                  {DECIDE_COPY.forSlot} {DECIDE_SLOT_LABEL[slot] || slot}
                </div>
                <div style={{ fontFamily: FD, fontSize: 20, marginTop: 2 }}>{Math.round(budget.cal)} cal</div>
                <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>
                  {macrosLine(budget.pNeed, budget.c, budget.f)}
                </div>
              </div>
              {laterCtaSlot ? (
                <button
                  type="button"
                  onClick={() => setPencilOpen((v) => !v)}
                  style={{
                    textAlign: "left",
                    border: laterCtaPiece?.meal ? `1px solid ${T.border}` : `1px dashed ${T.border}`,
                    borderRadius: 12,
                    padding: "8px 10px",
                    background: T.card,
                    fontFamily: F,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft }}>
                    {laterCtaPiece?.meal
                      ? `${SLOT_CHIP[laterCtaSlot] || laterCtaSlot}, ${DECIDE_COPY.pencilledBox}`
                      : `${DECIDE_COPY.savedFor} ${DECIDE_SLOT_LABEL[laterCtaSlot]}`}
                  </div>
                  <div style={{ fontFamily: FD, fontSize: 20, marginTop: 2 }}>
                    {laterCtaPiece?.meal ? laterCtaPiece.meal.name : `${Math.round(laterCtaPiece?.cal || 0)} cal`}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>
                    {laterCtaPiece?.meal
                      ? `${Math.round(laterCtaPiece.cal)} cal · ${macrosLine(laterCtaPiece.p, laterCtaPiece.c, laterCtaPiece.f)}`
                      : macrosLine(laterCtaPiece?.p, laterCtaPiece?.c, laterCtaPiece?.f)}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.accentDeep, fontWeight: 700, marginTop: 3 }}>
                    {laterCtaPiece?.meal ? DECIDE_COPY.change : knowLaterCopy(laterCtaSlot)}
                  </div>
                </button>
              ) : nextOpenSlot && nextOpenSlot !== slot ? (
                <button
                  type="button"
                  data-decide-next
                  data-decide-next-open={nextOpenSlot}
                  onClick={() => changeSlot(nextOpenSlot)}
                  style={{
                    textAlign: "left",
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    padding: "8px 10px",
                    background: T.sageSoft,
                    fontFamily: F,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.sage }}>{DECIDE_COPY.afterThis}</div>
                  <div style={{ fontFamily: FD, fontSize: 20, marginTop: 2 }}>
                    {decideNextCopy(nextOpenSlot)}
                  </div>
                </button>
              ) : nextOpenSlot ? (
                <div
                  data-decide-next-open={nextOpenSlot}
                  style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 10px", background: T.sageSoft }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.sage }}>{DECIDE_COPY.afterThis}</div>
                  <div style={{ fontFamily: FD, fontSize: 20, marginTop: 2 }}>
                    {decideNextCopy(nextOpenSlot)}
                  </div>
                </div>
              ) : (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 10px", background: T.sageSoft }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.sage }}>{DECIDE_COPY.afterThis}</div>
                  <div style={{ fontFamily: FD, fontSize: 20, marginTop: 2 }}>{DECIDE_COPY.doneToday}</div>
                </div>
              )}
            </div>
            {slot !== "snack" ? (
              snackCount > 0 ? (
                <SnackRoomStepper
                  count={snackCount}
                  onChange={stepSnack}
                  piece={budget.reserve?.bySlot?.snack}
                  onTurnOff={() => setSnackTo(0)}
                />
              ) : (
                <SnackIncludeToggle on={false} onTurnOn={() => setSnackTo(1)} />
              )
            ) : null}
            {pencilOpen && laterCtaSlot ? (
              <div data-decide-later-list style={{ marginTop: 8, border: `1px solid ${T.border}`, borderRadius: 14, padding: "8px 10px", background: T.card }}>
                {(laterRanked.meals || []).slice(0, 3).map((m) => (
                  <div key={m.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderTop: `1px solid ${T.border}` }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.title || m.name}</div>
                      <div style={{ fontSize: 11.5, color: T.inkSoft }}>{m.knowsYou} · {Math.round(m.cal)} cal · {macrosLine(m.p, m.c, m.f)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => pencilCard(m, laterCtaSlot)}
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
            {afterMove?.nextSlot ? (
              <div
                data-decide-next
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginTop: 8,
                  padding: "10px 12px",
                  borderRadius: 14,
                  background: T.sageSoft,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: T.sage }}>
                  {afterMove.kind === "logged" ? DECIDE_COPY.loggedShort : DECIDE_COPY.pencilledShort}
                </div>
                <button
                  type="button"
                  onClick={() => changeSlot(afterMove.nextSlot)}
                  style={{
                    fontFamily: F,
                    fontWeight: 800,
                    fontSize: 13,
                    color: "#fff",
                    background: T.accent,
                    border: "none",
                    borderRadius: 999,
                    padding: "8px 14px",
                    cursor: "pointer",
                  }}
                >
                  {decideNextCopy(afterMove.nextSlot)}
                </button>
              </div>
            ) : null}
            <div data-decide-search style={{ marginTop: 10 }}>
              <MealSearchInput
                value={planQuery}
                onChange={(value) => {
                  setPlanQuery(value);
                  if (mode !== "pick") setMode("pick");
                }}
                onFocus={() => {
                  if (mode !== "pick") setMode("pick");
                }}
                placeholder={DECIDE_COPY.searchToPlan}
                style={{ marginBottom: 0 }}
              />
            </div>
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
            {showModeSwitch ? (
            <div style={{
              display: "flex",
              gap: 4,
              marginTop: 10,
              background: T.track,
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
                    background: mode === id ? T.card : "transparent",
                    color: mode === id ? T.accentDeep : T.inkSoft,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            ) : null}
            </div>
            <div
              data-decide-sheet-scroll
              onScroll={markDecideScroll}
              style={{ overflow: "auto", flex: 1, minHeight: 0, marginTop: 10, display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16, touchAction: "pan-y" }}
            >
              {searching ? (
                searchHits.length ? searchHits.map((meal) => (
                  <div
                    key={meal.id || meal.name}
                    data-decide-search-row={meal.name}
                    style={{
                      border: `1px solid ${T.border}`,
                      borderRadius: 16,
                      padding: "10px 12px",
                      background: T.card,
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{meal.name}</div>
                    <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600, marginTop: 4 }}>
                      {Math.round(meal.cal || 0)} cal · {macrosLine(meal.p, meal.c, meal.f)}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => pencilCard({
                          ...meal,
                          source: meal.source || "bank",
                          servings: meal.servings || 1,
                        }, slot)}
                        style={{
                          fontFamily: F,
                          fontWeight: 700,
                          fontSize: 12.5,
                          color: "#fff",
                          background: T.accent,
                          border: "none",
                          borderRadius: 999,
                          padding: "7px 12px",
                          cursor: "pointer",
                        }}
                      >
                        {DECIDE_COPY.pencilIn}
                      </button>
                      <button
                        type="button"
                        onClick={() => logCard(meal)}
                        disabled={logging}
                        style={{
                          fontFamily: F,
                          fontWeight: 700,
                          fontSize: 12.5,
                          color: T.accentDeep,
                          background: T.accentSoft,
                          border: "none",
                          borderRadius: 999,
                          padding: "7px 12px",
                          cursor: logging ? "default" : "pointer",
                        }}
                      >
                        {DECIDE_COPY.logIt}
                      </button>
                    </div>
                  </div>
                )) : (
                  <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, padding: "8px 2px" }}>
                    No meals match “{planQuery.trim()}”.
                  </div>
                )
              ) : mode !== "pick" && ((mode === "kitchen" && !KITCHEN_FLAG) || (mode === "out" && !EATING_OUT_FLAG)) ? (
                <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, padding: "8px 2px" }}>
                  {DECIDE_COPY.comingSoon}
                </div>
              ) : featuredMeal ? (
                <CompactCard
                  card={featuredMeal}
                  featured
                  onLog={(c) => logCard(c)}
                  onPencil={(c) => pencilCard(c, slot)}
                  onOpen={openCard}
                  logging={logging}
                />
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
            </div>
            <div
              data-decide-sheet-chrome
              style={{
                flexShrink: 0,
                background: T.bg,
                padding: page
                  ? "10px 0 max(28px, env(safe-area-inset-bottom, 20px))"
                  : "8px 0 max(48px, env(safe-area-inset-bottom, 48px))",
                boxShadow: "0 -8px 16px rgba(51,39,46,0.04)",
                position: "relative",
                zIndex: 3,
                pointerEvents: "auto",
              }}
            >
              {mode === "pick" && !searching ? (
                <div data-decide-refine style={{ marginBottom: page ? 0 : 8 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    ["none", DECIDE_COPY.noneOfThese],
                    ["lighter", DECIDE_COPY.lighter],
                    ["protein", DECIDE_COPY.moreProtein],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      {...ownPointerClick((e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        refine(id);
                      })}
                      style={{
                        fontFamily: F,
                        fontSize: 12,
                        fontWeight: 700,
                        color: T.accentDeep,
                        background: T.accentSoft,
                        border: "none",
                        borderRadius: 999,
                        padding: "8px 12px",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  </div>
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
                      width: "100%",
                      boxSizing: "border-box",
                      marginTop: 6,
                      border: `1px solid ${T.border}`,
                      borderRadius: 999,
                      padding: "8px 12px",
                      fontFamily: F,
                      fontSize: 12.5,
                      background: T.card,
                    }}
                  />
                </div>
              ) : null}
              {page ? null : (
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
                  padding: "6px 0 0",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                {DECIDE_COPY.back}
              </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
