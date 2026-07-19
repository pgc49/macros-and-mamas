import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn, Field, Chip, inputStyle } from "../components/ui";

export function IntakeFlow({ profile, step, setStep, set, onSubmit }) {
  const steps = ["About you", "Postpartum", "Your goal", "Your tastes"];
  return (
    <Shell>
      <div style={{ display: "flex", gap: 6, margin: "10px 0 20px" }}>
        {steps.map((s, i) => (
          <div key={s} style={{ flex: 1, height: 5, borderRadius: 99, background: i <= step ? T.accent : T.track }} />
        ))}
      </div>
      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 16px" }}>{steps[step]}</h2>

      {step === 0 && (
        <Card>
          <Field label="First name"><input style={inputStyle} value={profile.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" /></Field>
          <Field label="Age"><input style={inputStyle} inputMode="numeric" value={profile.age} onChange={(e) => set("age", e.target.value)} placeholder="33" /></Field>
          <Field label="Current weight (lbs)"><input style={inputStyle} inputMode="numeric" value={profile.currentWeight} onChange={(e) => set("currentWeight", e.target.value)} placeholder="162" /></Field>
          <Field label="Goal weight (lbs) — where you feel your best"><input style={inputStyle} inputMode="numeric" value={profile.goalWeight} onChange={(e) => set("goalWeight", e.target.value)} placeholder="145" /></Field>
          <Field label="Cell number — your WhatsApp group invite comes by text">
            <input style={inputStyle} inputMode="tel" value={profile.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 555-5555" />
          </Field>
          <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
            Callie personally invites every mama to the group chat. Heads up: members of a WhatsApp group can see each other's numbers.
          </div>
          <Btn style={{ width: "100%", marginTop: 4 }} disabled={!profile.goalWeight || !profile.currentWeight || !profile.phone} onClick={() => setStep(1)}>Continue</Btn>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <Field label="Are you currently pregnant?">
            <div style={{ display: "flex", gap: 8 }}>
              <Chip active={profile.pregnant === true} onClick={() => set("pregnant", true)}>Yes</Chip>
              <Chip active={profile.pregnant === false} onClick={() => set("pregnant", false)}>No</Chip>
            </div>
          </Field>
          <Field label="How many months postpartum are you?">
            <input style={inputStyle} inputMode="numeric" value={profile.monthsPP} onChange={(e) => set("monthsPP", e.target.value)} placeholder="9" />
          </Field>
          <Field label="Are you breastfeeding?">
            <div style={{ display: "flex", gap: 8 }}>
              <Chip active={profile.breastfeeding === true} onClick={() => set("breastfeeding", true)}>Yes</Chip>
              <Chip active={profile.breastfeeding === false} onClick={() => set("breastfeeding", false)}>No</Chip>
            </div>
          </Field>
          <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
            If you're nursing, your macros are set gently. Milk supply comes first, always.
          </div>
          <Btn style={{ width: "100%" }} disabled={profile.pregnant === null || profile.breastfeeding === null || !profile.monthsPP} onClick={() => setStep(2)}>Continue</Btn>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <Field label="What's your main goal?">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip active={profile.goal === "lose"} onClick={() => set("goal", "lose")}>Lose fat</Chip>
              <Chip active={profile.goal === "maintain"} onClick={() => set("goal", "maintain")}>Maintain</Chip>
              <Chip active={profile.goal === "gain"} onClick={() => set("goal", "gain")}>Build strength</Chip>
            </div>
          </Field>
          <Field label="How much are you moving right now?">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip active={profile.activity === "low"} onClick={() => set("activity", "low")}>Not much yet</Chip>
              <Chip active={profile.activity === "moderate"} onClick={() => set("activity", "moderate")}>Walks + some workouts</Chip>
              <Chip active={profile.activity === "high"} onClick={() => set("activity", "high")}>Very active</Chip>
            </div>
          </Field>
          <Field label="Stress level lately">
            <div style={{ display: "flex", gap: 8 }}>
              <Chip active={profile.stress === "low"} onClick={() => set("stress", "low")}>Low</Chip>
              <Chip active={profile.stress === "medium"} onClick={() => set("stress", "medium")}>Medium</Chip>
              <Chip active={profile.stress === "high"} onClick={() => set("stress", "high")}>High</Chip>
            </div>
          </Field>
          <Field label="Has a doctor mentioned insulin resistance or PCOS?">
            <div style={{ display: "flex", gap: 8 }}>
              <Chip active={profile.insulinResistance} onClick={() => set("insulinResistance", true)}>Yes</Chip>
              <Chip active={!profile.insulinResistance} onClick={() => set("insulinResistance", false)}>No</Chip>
            </div>
          </Field>
          <Field label="Do you eat animal protein?">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip active={profile.diet === "none"} onClick={() => set("diet", "none")}>Yes</Chip>
              <Chip active={profile.diet === "vegetarian"} onClick={() => set("diet", "vegetarian")}>Vegetarian</Chip>
              <Chip active={profile.diet === "vegan"} onClick={() => set("diet", "vegan")}>Vegan</Chip>
            </div>
          </Field>
          <Btn style={{ width: "100%", marginTop: 4 }} onClick={() => setStep(3)}>Continue</Btn>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>
            Last one, and it's the fun one. Tell Callie what you actually love to eat — your meal plan gets adapted to your tastes, not the other way around.
          </div>
          <Field label="Breakfast foods you love">
            <input style={inputStyle} value={profile.prefB} onChange={(e) => set("prefB", e.target.value)} placeholder="smoothies, bagels, anything with peanut butter" />
          </Field>
          <Field label="Lunch foods you love">
            <input style={inputStyle} value={profile.prefL} onChange={(e) => set("prefL", e.target.value)} placeholder="big salads, sandwiches, leftovers" />
          </Field>
          <Field label="Dinner foods you love">
            <input style={inputStyle} value={profile.prefD} onChange={(e) => set("prefD", e.target.value)} placeholder="tacos, pasta night, asian flavors" />
          </Field>
          <Btn style={{ width: "100%", marginTop: 4 }} onClick={onSubmit}>Send to Callie</Btn>
        </Card>
      )}
    </Shell>
  );
}
