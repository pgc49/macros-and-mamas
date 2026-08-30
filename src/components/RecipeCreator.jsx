import { useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Btn, inputStyle } from "./ui";
import { SlotChips } from "./SlotChips";
import { guessSlotFromTime, normalizeSlot } from "../utils/mealSlots";
import { MAX_RECIPE_SERVINGS, normalizeServings, perServingMacros } from "../utils/recipeMacros";

/** Matches MAX_RECIPE_CHARS in functions/api/estimate.js. */
const PASTE_MAX = 4000;
const URL_RE = /(https?:\/\/|www\.)\S+/i;

const MACRO_KEYS = [
  ["cal", "CAL"],
  ["p", "P"],
  ["c", "C"],
  ["f", "F"],
];

/**
 * Turn a recipe she found into one of her own saved meals.
 *
 * The AI adds up the whole batch; she says how many servings it made. Yield
 * is the number that scales everything, so it is hers to confirm — and the
 * division happens locally, so changing it never costs another AI call.
 *
 * What gets saved is ONE SERVING, matching how RECIPES[] in data.js already
 * stores Callie's own cards.
 *
 * `embedded` — always show the form (Plan / My meals add sheets).
 * `onSaved(saved)` — after a successful save (saved row from db).
 */
export function RecipeCreator({
  onEstimateRecipe,
  onSaveCustomMeal,
  embedded = false,
  onSaved,
  onCancel,
  saveLabel = "Save to My meals",
  defaultSlot,
}) {
  const [open, setOpen] = useState(!!embedded);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState("");
  const [slot, setSlot] = useState(() => normalizeSlot(defaultSlot) || guessSlotFromTime());

  const reset = () => {
    setPaste("");
    setDraft(null);
    setError("");
    setBusy(false);
  };

  const close = () => {
    reset();
    if (embedded) {
      onCancel?.();
      return;
    }
    setOpen(false);
  };

  const readRecipe = async () => {
    const text = paste.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setSaved("");
    const result = await onEstimateRecipe?.(text);
    if (!result || result.error) {
      setError(result?.message || "Couldn't read that recipe. Try pasting just the ingredients.");
      setBusy(false);
      return;
    }
    setDraft({
      name: result.meal || "My recipe",
      serves: String(normalizeServings(result.servings)),
      batch: {
        cal: String(result.calories ?? 0),
        p: String(result.protein_g ?? 0),
        c: String(result.carbs_g ?? 0),
        f: String(result.fat_g ?? 0),
      },
      items: result.items || [],
      tip: result.tip || "",
      confidence: result.confidence || "medium",
    });
    setBusy(false);
  };

  const batchNums = draft
    ? {
        cal: Number(draft.batch.cal) || 0,
        p: Number(draft.batch.p) || 0,
        c: Number(draft.batch.c) || 0,
        f: Number(draft.batch.f) || 0,
      }
    : null;
  const serves = draft ? normalizeServings(draft.serves) : 1;
  const perServing = batchNums ? perServingMacros(batchNums, serves) : null;

  const save = async () => {
    if (!draft || !perServing || busy) return;
    const name = String(draft.name || "").trim() || "My recipe";
    setBusy(true);
    const result = await onSaveCustomMeal?.({
      name,
      ...perServing,
      serves,
      ingredients: (draft.items || []).join("\n"),
      slot: normalizeSlot(slot),
    });
    setBusy(false);
    if (!result) {
      setError("Couldn't save that recipe. Try again in a moment.");
      return;
    }
    setSaved(`Saved “${name}” — ${perServing.cal} cal per serving.`);
    reset();
    onSaved?.(result);
    if (embedded) return;
    setOpen(false);
  };

  if (!open && !embedded) {
    return (
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => { setOpen(true); setSaved(""); }}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: `1.5px dashed ${T.accent}`,
            background: "#fff",
            color: T.accentDeep,
            fontFamily: F,
            fontSize: 13.5,
            fontWeight: 700,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          ＋ Create a recipe
          <div style={{ fontWeight: 500, fontSize: 11.5, color: T.inkSoft, marginTop: 3 }}>
            Paste one you found, set how many it serves, save the per-serving macros.
          </div>
        </button>
        {saved && (
          <div style={{ fontSize: 12.5, color: T.sage, marginTop: 8, fontWeight: 600 }}>{saved}</div>
        )}
      </div>
    );
  }

  const numField = (key, label, value, onChange, width = 62) => (
    <div key={key} style={{ textAlign: "center" }}>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width,
          padding: "8px",
          fontSize: 15,
          textAlign: "center",
          border: `1.5px solid ${T.border}`,
          borderRadius: 10,
          fontFamily: F,
          background: "#fff",
        }}
      />
      <div style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div
      style={{
        marginBottom: 12,
        border: `1.5px solid ${T.accent}`,
        borderRadius: 14,
        background: T.accentSoft,
        padding: 14,
      }}
    >
      {!embedded && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
          <div style={{ fontFamily: FD, fontSize: 17, color: T.ink }}>Create a recipe</div>
          <button
            type="button"
            onClick={close}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              fontSize: 12.5,
              color: T.inkSoft,
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: F,
            }}
          >
            close
          </button>
        </div>
      )}

      {!draft ? (
        <>
          <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, marginBottom: 8 }}>
            Paste the ingredients — the whole batch, exactly as the recipe writes them.
            You’ll set how many servings it makes next.
          </div>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value.slice(0, PASTE_MAX))}
            placeholder={"Turkey chili\n2 lb ground turkey\n2 cans kidney beans\n1 can crushed tomatoes\n1 onion, diced\n2 tbsp olive oil"}
            disabled={busy}
            rows={7}
            maxLength={PASTE_MAX}
            style={{
              ...inputStyle,
              width: "100%",
              padding: "11px 13px",
              fontSize: 14,
              lineHeight: 1.5,
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          {URL_RE.test(paste) && (
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
              I can’t open links — paste the recipe text itself and I’ll read that.
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <Btn small onClick={readRecipe} disabled={busy || !paste.trim()}>
              {busy ? "Reading…" : "Read recipe"}
            </Btn>
            <span style={{ fontSize: 11, color: T.inkSoft, marginLeft: "auto" }}>
              {paste.length}/{PASTE_MAX}
            </span>
          </div>
        </>
      ) : (
        <>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Recipe name"
            maxLength={80}
            style={{
              width: "100%",
              padding: "9px 11px",
              fontSize: 15,
              fontWeight: 600,
              border: `1.5px solid ${T.border}`,
              borderRadius: 10,
              fontFamily: F,
              background: "#fff",
              marginBottom: 10,
              boxSizing: "border-box",
            }}
          />

          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.3, marginBottom: 6 }}>
            Whole batch
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            {MACRO_KEYS.map(([key, label]) =>
              numField(key, label, draft.batch[key], (v) =>
                setDraft((d) => ({ ...d, batch: { ...d.batch, [key]: v } })),
              ),
            )}
          </div>

          <div style={{
            background: "#fff",
            borderRadius: 12,
            padding: "11px 13px",
            border: `1.5px solid ${T.accent}`,
            marginBottom: 10,
          }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Makes</span>
              <input
                inputMode="numeric"
                value={draft.serves}
                onChange={(e) => setDraft((d) => ({ ...d, serves: e.target.value }))}
                style={{
                  width: 62,
                  padding: "8px",
                  fontSize: 16,
                  fontWeight: 700,
                  textAlign: "center",
                  border: `1.5px solid ${T.accent}`,
                  borderRadius: 10,
                  fontFamily: F,
                }}
              />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>servings</span>
            </label>
            <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6, lineHeight: 1.45 }}>
              Change this to however many portions you actually got — everything below
              divides by it. Max {MAX_RECIPE_SERVINGS}.
            </div>
          </div>

          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.accentDeep, letterSpacing: 0.3, marginBottom: 6 }}>
            One serving · this is what gets saved
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {MACRO_KEYS.map(([key, label]) => (
              <div
                key={key}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "9px 0",
                  borderRadius: 10,
                  background: T.sageSoft,
                }}
              >
                <div style={{ fontFamily: FD, fontSize: 18, color: "#3E5A46" }}>{perServing[key]}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.sage, letterSpacing: 0.4 }}>{label}</div>
              </div>
            ))}
          </div>

          {(draft.items || []).length > 0 && (
            <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5, marginBottom: 10 }}>
              {draft.items.join(" · ")}
            </div>
          )}
          {draft.tip && (
            <div style={{ fontSize: 13, color: T.accentDeep, lineHeight: 1.5, marginBottom: 10 }}>
              💬 {draft.tip}
            </div>
          )}
          {error && (
            <div style={{ fontSize: 12.5, color: T.amber, marginBottom: 10, lineHeight: 1.5 }}>{error}</div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.3, marginBottom: 6 }}>
              Save as
            </div>
            <SlotChips value={slot} onChange={setSlot} compact />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn small onClick={save} disabled={busy}>
              {busy ? "Saving…" : saveLabel}
            </Btn>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "none",
                border: "none",
                fontSize: 13,
                color: T.inkSoft,
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: F,
              }}
            >
              start over
            </button>
            <span style={{ fontSize: 11.5, color: T.inkSoft, marginLeft: "auto" }}>
              AI draft · {draft.confidence} confidence
            </span>
          </div>
        </>
      )}

      {!draft && error && (
        <div style={{ fontSize: 12.5, color: T.amber, marginTop: 10, lineHeight: 1.5 }}>{error}</div>
      )}
    </div>
  );
}
