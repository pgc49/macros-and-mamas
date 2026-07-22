import { useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, inputStyle } from "../components/ui";
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
  const dayOk = ir.cal !== false && ir.p !== false && ir.c !== false && ir.f !== false;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontFamily: FD, fontSize: 18 }}>{day.day}</span>
          {day.theme && (
            <span style={{ fontSize: 13, color: T.inkSoft, marginLeft: 8 }}>{day.theme}</span>
          )}
          {!dayOk && (
            <span style={{ fontSize: 12, fontWeight: 700, color: T.amber, marginLeft: 8 }}>out of range</span>
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

function countOutOfRange(plan) {
  if (typeof plan?.meta?.outOfRangeDays === "number") return plan.meta.outOfRangeDays;
  return (plan?.days || []).filter((d) => {
    const ir = d.inRange || {};
    return Object.values(ir).some((v) => v === false);
  }).length;
}

/**
 * Admin-only: generate & review a 7-day meal plan draft for one client.
 * Not client-facing. Drafts cached in localStorage for Callie's browser.
 * Callie can leave revision notes and regenerate from the prior draft.
 */
export function MealPlanDraft({ client }) {
  const [plan, setPlan] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPlan(loadCached(client.id));
    setFeedback("");
    setError("");
  }, [client.id]);

  const generate = async ({ withFeedback = false } = {}) => {
    const notes = withFeedback ? feedback.trim() : "";
    if (withFeedback && !notes) {
      setError("Add a short note for Callie first — what to change on the next pass.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in again");
      const body = { clientId: client.id };
      if (withFeedback) {
        body.feedback = notes;
        body.previousPlan = plan;
      }
      const resp = await fetch("/api/meal-plan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Generate failed (${resp.status})`);
      setPlan(data.plan);
      saveCached(client.id, data.plan);
      if (withFeedback) setFeedback("");
    } catch (e) {
      console.error("meal plan generate failed", e);
      setError(e.message || "Couldn’t generate plan");
    }
    setBusy(false);
  };

  const clearDraft = () => {
    setPlan(null);
    setFeedback("");
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

  const oob = countOutOfRange(plan);

  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Meal plan draft</div>
          <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45 }}>
            Admin-only. Uses her tastes, your recipe bank, and her ranges.
            Days must land in band (prompt forces portion adjusts). Leave notes below to regenerate with your feedback.
            Not shown to her yet.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn small disabled={busy} onClick={() => generate({ withFeedback: false })}>
            {busy ? "Generating…" : plan ? "Fresh 7-day draft" : "Generate 7-day draft"}
          </Btn>
          {plan && (
            <Btn small ghost disabled={busy} onClick={clearDraft}>Clear draft</Btn>
          )}
        </div>
      </div>

      {busy && (
        <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 10, lineHeight: 1.5 }}>
          Building her week — this can take 30–90 seconds. Ranges + any Callie notes are in the prompt.
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13.5, color: T.amber, marginBottom: 10 }}>{error}</div>
      )}

      {plan && (
        <>
          {oob > 0 && (
            <div style={{ background: T.amberSoft, borderRadius: 12, padding: "12px 14px", marginBottom: 12, fontSize: 13.5, lineHeight: 1.55, color: T.amber }}>
              <b>{oob} day{oob === 1 ? "" : "s"} still out of range</b> (amber chips).
              Tell the model what to fix in the box below — e.g. “Thu fat too low, add oil/avocado; bump calories into band” — then regenerate with feedback.
            </div>
          )}

          {plan.summaryForCallie && (
            <div style={{ background: T.accentSoft, borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontSize: 13.5, lineHeight: 1.55, color: T.accentDeep }}>
              <b>For Callie:</b> {plan.summaryForCallie}
            </div>
          )}
          {plan.meta && (
            <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 12 }}>
              Draft · {plan.meta.model} · {plan.meta.generatedAt ? new Date(plan.meta.generatedAt).toLocaleString() : ""}
              {plan.meta.hadFeedback ? " · revised from your notes" : ""} · not client-facing
            </div>
          )}

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, border: `1px solid ${T.border}`, background: "#fff" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
              Your notes for the next pass
            </div>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8, lineHeight: 1.45 }}>
              Proteins to lean on, recipes to swap, days that miss, house rules — anything you want fixed. The next generate includes this draft + your notes.
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={busy}
              rows={4}
              placeholder="Example: Swap Thu pancakes for eggs + sausage. Fat is chronically low — add measured olive oil or avocado at dinner. Keep chicken teriyaki but she needs closer to mid-band calories."
              style={{ ...inputStyle, resize: "vertical", minHeight: 96, fontFamily: F }}
            />
            <div style={{ marginTop: 10 }}>
              <Btn small disabled={busy || !feedback.trim()} onClick={() => generate({ withFeedback: true })}>
                {busy ? "Generating…" : "Regenerate with my notes"}
              </Btn>
            </div>
          </div>

          {(plan.days || []).map((day) => (
            <DayBlock key={day.day} day={day} target={plan.dailyTarget} />
          ))}
        </>
      )}
    </Card>
  );
}
