import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { T, F, FD } from "../theme/tokens";
import { COACH_COPY } from "../content/coachVoice";
import { logSaveSucceeded } from "../utils/logSave";

const AI_SOURCES = new Set(["menu", "kitchen", "new"]);

function macroLine(meal) {
  return `${Math.round(meal.cal || 0)} cal · P ${Math.round(meal.p || 0)} · C ${Math.round(meal.c || 0)} · F ${Math.round(meal.f || 0)}`;
}

function ingredientLines(meal) {
  const raw = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
  return raw
    .map((line) => {
      if (typeof line === "string") return line;
      const amount = String(line?.amount || "").trim();
      const item = String(line?.item || line?.name || "").trim();
      return [amount, item].filter(Boolean).join(" ");
    })
    .filter(Boolean);
}

const chip = (bg, color) => ({
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color,
  background: bg,
  borderRadius: 99,
  padding: "3px 8px",
  whiteSpace: "nowrap",
});

const actionBtn = (kind, disabled) => ({
  fontFamily: F,
  fontSize: 13,
  fontWeight: 700,
  padding: "9px 14px",
  minHeight: 40,
  borderRadius: 999,
  cursor: disabled ? "default" : "pointer",
  border: kind === "primary" ? "none" : `1.5px solid ${T.border}`,
  background: kind === "primary" ? (disabled ? T.track : T.accent) : "#fff",
  color: kind === "primary" ? "#fff" : T.inkSoft,
  opacity: disabled ? 0.7 : 1,
});

/**
 * One suggestion. Actions run through the same write paths the rest of the
 * app uses, and follow the save contract: only an explicit true clears the
 * button, so a failed write can never look like a logged meal.
 */
export function CoachMealCard({ card, onLog, onPencil, onSave, onOpen, compact = false }) {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  const run = async (fn, doneLabel) => {
    if (busyRef.current || phase === "done") return;
    busyRef.current = true;
    setPhase("busy");
    setError("");
    try {
      const ok = await fn?.(card);
      if (!logSaveSucceeded(ok)) {
        setPhase("idle");
        setError(COACH_COPY.logFailed);
        return;
      }
      setPhase(doneLabel);
    } catch {
      setPhase("idle");
      setError(COACH_COPY.logFailed);
    } finally {
      busyRef.current = false;
    }
  };

  const isEstimate = AI_SOURCES.has(card.source);
  const done = phase === "logged" || phase === "pencilled";

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${done ? T.sageSoft : T.border}`,
        borderRadius: 14,
        padding: compact ? 12 : 14,
        marginTop: 8,
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <span style={chip(T.track, T.inkSoft)}>{card.tag}</span>
        {card.knowsYou && <span style={chip(T.accentSoft, T.accentDeep)}>{card.knowsYou}</span>}
      </div>

      <div data-testid="coach-card-title" style={{ fontFamily: FD, fontSize: 18, lineHeight: 1.25, marginBottom: 2 }}>
        {card.title}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{macroLine(card)}</div>
      {card.reason && (
        <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45 }}>{card.reason}</div>
      )}
      {card.proteinNote && (
        <div style={{ fontSize: 12.5, color: T.sage, marginTop: 4 }}>{card.proteinNote}</div>
      )}
      {isEstimate && (
        <div style={{ fontSize: 12, color: T.amber, marginTop: 4 }}>{COACH_COPY.estimateNote}</div>
      )}

      {error && <div style={{ fontSize: 12.5, color: T.accentDeep, marginTop: 6 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {phase === "logged" ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: T.sage, alignSelf: "center" }}>
            {COACH_COPY.loggedShort}
          </span>
        ) : phase === "pencilled" ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: T.sage, alignSelf: "center" }}>
            {COACH_COPY.pencilledShort}
          </span>
        ) : (
          <>
            <button
              type="button"
              style={actionBtn("primary", phase === "busy")}
              disabled={phase === "busy"}
              onClick={() => run(onLog, "logged")}
            >
              {COACH_COPY.logIt}
            </button>
            {onPencil && (
              <button
                type="button"
                style={actionBtn("ghost", phase === "busy")}
                disabled={phase === "busy"}
                onClick={() => run(onPencil, "pencilled")}
              >
                {COACH_COPY.pencilIn}
              </button>
            )}
          </>
        )}
        {onOpen && !done && (
          <button
            type="button"
            style={{ ...actionBtn("ghost", false), border: "none", color: T.accentDeep }}
            onClick={() => onOpen(card)}
          >
            {COACH_COPY.seeRecipe}
          </button>
        )}
      </div>
      {onSave && !done && isEstimate && (
        <button
          type="button"
          style={{
            fontFamily: F,
            fontSize: 12.5,
            fontWeight: 700,
            color: T.accentDeep,
            background: "none",
            border: "none",
            padding: "8px 0 0",
            cursor: "pointer",
          }}
          onClick={() => run(onSave, "idle")}
        >
          {COACH_COPY.saveToMine}
        </button>
      )}
    </div>
  );
}

/** Full recipe for one card. Portalled — a fixed sheet inside Shell gets clipped. */
export function CoachMealSheet({ card, onClose, onLog, onPencil, onSave }) {
  if (!card) return null;
  const ingredients = ingredientLines(card);
  const steps = Array.isArray(card.steps) ? card.steps.filter(Boolean) : [];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card.title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(40, 24, 32, 0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "min(92dvh, 720px)",
          overflow: "auto",
          WebkitOverflowScrolling: "touch",
          background: "#fff",
          borderRadius: "18px 18px 0 0",
          padding: "16px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -8px 40px rgba(40, 24, 32, 0.18)",
          boxSizing: "border-box",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontFamily: FD, fontSize: 21, lineHeight: 1.2 }}>{card.title}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{macroLine(card)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: F,
              fontSize: 13,
              fontWeight: 700,
              color: T.inkSoft,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
            }}
          >
            {COACH_COPY.close}
          </button>
        </div>

        {card.desc && (
          <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, margin: "10px 0 0" }}>{card.desc}</p>
        )}

        {ingredients.length > 0 && (
          <>
            <h3 style={{ fontFamily: F, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: T.inkSoft, margin: "16px 0 6px" }}>
              What's in it
            </h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
              {ingredients.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </>
        )}

        {steps.length > 0 && (
          <>
            <h3 style={{ fontFamily: F, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: T.inkSoft, margin: "16px 0 6px" }}>
              How to make it
            </h3>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
              {steps.map((line) => <li key={line}>{line}</li>)}
            </ol>
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <CoachMealCard
            card={card}
            onLog={onLog}
            onPencil={onPencil}
            onSave={onSave}
            compact
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
