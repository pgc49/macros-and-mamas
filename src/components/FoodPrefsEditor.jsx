import { useEffect, useState } from "react";
import { T, F, FD } from "../theme/tokens";
import { Card, Btn, Chip } from "./ui";
import { ALLERGEN_OPTIONS, DIET_OPTIONS, normalizeAllergens, normalizeDiet } from "../content/foodPrefs";

/** Preferences editor — used from Meals → Food prefs chip (not on the plan board). */
export function FoodPrefsEditor({ profile, onSave }) {
  const [diet, setDiet] = useState(normalizeDiet(profile?.diet));
  const [allergens, setAllergens] = useState(() => normalizeAllergens(profile?.allergens));
  const [allergenNote, setAllergenNote] = useState(profile?.allergenNote || "");
  const [foodAvoids, setFoodAvoids] = useState(profile?.foodAvoids || "");
  const [prefB, setPrefB] = useState(profile?.prefB || "");
  const [prefL, setPrefL] = useState(profile?.prefL || "");
  const [prefD, setPrefD] = useState(profile?.prefD || "");
  const [prefS, setPrefS] = useState(profile?.prefS || "");
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setDiet(normalizeDiet(profile?.diet));
    setAllergens(normalizeAllergens(profile?.allergens));
    setAllergenNote(profile?.allergenNote || "");
    setFoodAvoids(profile?.foodAvoids || "");
    setPrefB(profile?.prefB || "");
    setPrefL(profile?.prefL || "");
    setPrefD(profile?.prefD || "");
    setPrefS(profile?.prefS || "");
  }, [
    profile?.diet,
    profile?.allergens,
    profile?.allergenNote,
    profile?.foodAvoids,
    profile?.prefB,
    profile?.prefL,
    profile?.prefD,
    profile?.prefS,
  ]);

  const profileAllergens = normalizeAllergens(profile?.allergens).slice().sort().join(",");
  const localAllergens = allergens.slice().sort().join(",");

  const dirty =
    diet !== normalizeDiet(profile?.diet)
    || localAllergens !== profileAllergens
    || (allergenNote || "") !== (profile?.allergenNote || "")
    || (foodAvoids || "") !== (profile?.foodAvoids || "")
    || (prefB || "") !== (profile?.prefB || "")
    || (prefL || "") !== (profile?.prefL || "")
    || (prefD || "") !== (profile?.prefD || "")
    || (prefS || "") !== (profile?.prefS || "");

  const toggleAllergen = (id) => {
    setAllergens((prev) => (
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    ));
  };

  const save = async () => {
    if (!onSave) return;
    setBusy(true);
    setErr("");
    try {
      await onSave({
        diet,
        allergens,
        allergenNote,
        foodAvoids,
        prefB,
        prefL,
        prefD,
        prefS,
      });
      setSavedMsg("Saved — Suggest my week will use these.");
      window.setTimeout(() => setSavedMsg(""), 3500);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Couldn’t save preferences.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>My food preferences</h2>
      <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px", lineHeight: 1.5 }}>
        Diet and allergens gate every AI meal. Loves steer what you actually want to eat.
      </p>
      <Card style={{ padding: 14 }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>How do you eat?</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {DIET_OPTIONS.map((opt) => {
            const active = diet === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDiet(opt.id)}
                style={{
                  textAlign: "left",
                  fontFamily: F,
                  border: `1.5px solid ${active ? T.accent : T.border}`,
                  background: active ? T.accentSoft : "#fff",
                  borderRadius: 12,
                  padding: "12px 14px",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>{opt.label}</div>
                <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3, lineHeight: 1.4 }}>{opt.hint}</div>
              </button>
            );
          })}
        </div>

        <div style={{ ...labelStyle, marginBottom: 6 }}>Allergies / never eat</div>
        <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 8px", lineHeight: 1.45 }}>
          Hard ban — Suggest my week will not include these.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {ALLERGEN_OPTIONS.map((a) => (
            <Chip
              key={a.id}
              active={allergens.includes(a.id)}
              onClick={() => toggleAllergen(a.id)}
            >
              {a.label}
            </Chip>
          ))}
        </div>
        <label style={labelStyle}>
          Other allergens (optional)
          <input
            style={inputStyle}
            value={allergenNote}
            onChange={(e) => setAllergenNote(e.target.value)}
            placeholder="e.g. kiwi, sunflower seeds…"
          />
        </label>

        <label style={labelStyle}>
          Soft avoids (optional)
          <input
            style={inputStyle}
            value={foodAvoids}
            onChange={(e) => setFoodAvoids(e.target.value)}
            placeholder="e.g. mushrooms, cilantro, very spicy…"
          />
        </label>

        <div style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: T.inkSoft,
          letterSpacing: "0.02em",
          margin: "6px 0 10px",
        }}
        >
          Foods you love
        </div>
        <label style={labelStyle}>
          Breakfast
          <input
            style={inputStyle}
            value={prefB}
            onChange={(e) => setPrefB(e.target.value)}
            placeholder="smoothies, oatmeal, eggs…"
          />
        </label>
        <label style={labelStyle}>
          Lunch
          <input
            style={inputStyle}
            value={prefL}
            onChange={(e) => setPrefL(e.target.value)}
            placeholder="big salads, leftovers, wraps…"
          />
        </label>
        <label style={labelStyle}>
          Dinner
          <input
            style={inputStyle}
            value={prefD}
            onChange={(e) => setPrefD(e.target.value)}
            placeholder="tacos, salmon, tofu bowls…"
          />
        </label>
        <label style={labelStyle}>
          Snacks
          <input
            style={inputStyle}
            value={prefS}
            onChange={(e) => setPrefS(e.target.value)}
            placeholder="yogurt, apple + PB, protein shake…"
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4 }}>
          <Btn small onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save preferences"}
          </Btn>
          {savedMsg && !dirty && (
            <span style={{ fontSize: 12.5, color: "#3E5A46" }}>{savedMsg}</span>
          )}
          {dirty && (
            <span style={{ fontSize: 12.5, color: T.inkSoft }}>Unsaved changes</span>
          )}
        </div>
        {err && <div style={{ fontSize: 12.5, color: T.amber, marginTop: 8 }}>{err}</div>}
      </Card>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: T.inkSoft,
  marginBottom: 10,
};

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "10px 12px",
  fontSize: 15,
  fontFamily: F,
  border: `1.5px solid ${T.border}`,
  borderRadius: 12,
  background: "#fff",
  color: T.ink,
  boxSizing: "border-box",
};
