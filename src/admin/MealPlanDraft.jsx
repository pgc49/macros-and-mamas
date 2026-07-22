import { useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn } from "../components/ui";
import { supabase } from "../lib/supabase";

const STORAGE_PREFIX = "mm_meal_plan_draft_";

function loadCached(clientId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + clientId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCached(clientId, plan) {
  try {
    localStorage.setItem(STORAGE_PREFIX + clientId, JSON.stringify(plan));
  } catch {
    /* ignore */
  }
}

function MacroChip({ label, value, ok }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 99,
        background: ok ? T.sageSoft : T.amberSoft,
        color: ok ? T.sage : T.amber,
      }}
    >
      {label} {value}
    </span>
  );
}

function RecipeCard({ meal, open, onToggle }) {
  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        background: T.card,
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          textAlign: "left",
          border: "none",
          background: "transparent",
          padding: "12px 14px",
          cursor: "pointer",
          fontFamily: F,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.04, textTransform: "uppercase", color: T.accentDeep }}>
              {meal.slot}
            </div>
            <div style={{ fontFamily: FD, fontSize: 17, color: T.ink, marginTop: 2 }}>{meal.name}</div>
            {meal.why && (
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 4, lineHeight: 1.4 }}>{meal.why}</div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>
              {Math.round(meal.cal || 0)} cal
            </div>
            <div style={{ fontSize: 12, color: T.inkSoft }}>
              {Math.round(meal.p || 0)}P · {Math.round(meal.c || 0)}C · {Math.round(meal.f || 0)}F
            </div>
            <div style={{ fontSize: 12, color: T.accent, fontWeight: 700, marginTop: 4 }}>
              {open ? "Hide ▴" : "Open recipe ▾"}
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px dashed ${T.border}` }}>
          {meal.basedOn && (
            <div style={{ fontSize: 12.5, color: T.inkSoft, margin: "10px 0 8px" }}>
              Based on Callie&apos;s <b style={{ color: T.ink }}>{meal.basedOn}</b>
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Ingredients</div>
          <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.5, color: T.ink }}>
            {(meal.ingredients || []).map((ing, i) => (
              <li key={i}>
                <b>{ing.amount}</b> {ing.item}
              </li>
            ))}
          </ul>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Steps</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: T.ink }}>
            {(meal.steps || []).map((s, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function DayBlock({ day, target }) {
  const [openKey, setOpenKey] = useState(null);
  const t = day.dayTotals || {};
  const ir = day.inRange || {};

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontFamily: FD, fontSize: 18 }}>{day.day}</span>
          {day.theme && (
            <span style={{ fontSize: 13, color: T.inkSoft, marginLeft: 8 }}>{day.theme}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <MacroChip label="cal" value={t.cal} ok={ir.cal} />
          <MacroChip label="P" value={`${t.p}g`} ok={ir.p} />
          <MacroChip label="C" value={`${t.c}g`} ok={ir.c} />
          <MacroChip label="F" value={`${t.f}g`} ok={ir.f} />
        </div>
      </div>
      {target && (
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 8 }}>
          Target {target.calLo}–{target.calHi} cal · {target.pLo}–{target.pHi}P · {target.cLo}–{target.cHi}C · {target.fLo}–{target.fHi}F
        </div>
      )}
      {(day.meals || []).map((meal, idx) => {
        const key = `${day.day}-${idx}`;
        return (
          <RecipeCard
            key={key}
            meal={meal}
            open={openKey === key}
            onToggle={() => setOpenKey((k) => (k === key ? null : key))}
          />
        );
      })}
    </div>
  );
}

/**
 * Admin-only: generate & review a 7-day meal plan draft for one client.
 * Not client-facing. Drafts cached in localStorage for Callie's browser.
 */
export function MealPlanDraft({ client }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPlan(loadCached(client.id));
    setError("");
  }, [client.id]);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again");
      const resp = await fetch("/api/meal-plan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientId: client.id }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Generate failed (${resp.status})`);
      setPlan(data.plan);
      saveCached(client.id, data.plan);
    } catch (e) {
      console.error("meal plan generate failed", e);
      setError(e.message || "Couldn’t generate plan");
    }
    setBusy(false);
  };

  const clearDraft = () => {
    setPlan(null);
    try {
      localStorage.removeItem(STORAGE_PREFIX + client.id);
    } catch {
      /* ignore */
    }
  };

  if (!client.macros) {
    return (
      <Card style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Meal plan draft</div>
        <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
          Set / approve her macro ranges first — the generator needs those bands.
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Meal plan draft</div>
          <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45 }}>
            Admin-only preview. Uses her intake tastes, your recipe bank, and her ranges.
            Prompt requires ingredient-grounded macros (no guessing) and day totals that truly land in band.
            Not shown to her yet.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn small disabled={busy} onClick={generate}>
            {busy ? "Generating…" : plan ? "Regenerate week" : "Generate 7-day draft"}
          </Btn>
          {plan && (
            <Btn small ghost disabled={busy} onClick={clearDraft}>Clear draft</Btn>
          )}
        </div>
      </div>

      {busy && (
        <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 10, lineHeight: 1.5 }}>
          Building her week — this can take 30–90 seconds with a reasoning model.
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13.5, color: T.amber, marginBottom: 10 }}>{error}</div>
      )}

      {plan && (
        <>
          {plan.summaryForCallie && (
            <div style={{ background: T.accentSoft, borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontSize: 13.5, lineHeight: 1.55, color: T.accentDeep }}>
              <b>For Callie:</b> {plan.summaryForCallie}
            </div>
          )}
          {plan.meta && (
            <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 12 }}>
              Draft · {plan.meta.model} · {plan.meta.generatedAt ? new Date(plan.meta.generatedAt).toLocaleString() : ""} · not client-facing
            </div>
          )}
          {(plan.days || []).map((day) => (
            <DayBlock key={day.day} day={day} target={plan.dailyTarget} />
          ))}
        </>
      )}
    </Card>
  );
}
