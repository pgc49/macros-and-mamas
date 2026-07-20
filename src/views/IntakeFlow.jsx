import { useEffect, useRef, useState } from "react";
import { FD, T, F } from "../theme/tokens";
import { Shell, Card, Btn, Field, Chip, inputStyle } from "../components/ui";
import { useAuth } from "../auth/useAuth.jsx";
import { db } from "../db/db";

const REFUND_COPY =
  "Your $149 has been fully refunded — it'll land back on your card in a few days. We'll be here when the time is right.";

function WaitlistCapture({
  reason,
  monthsPp,
  buttonLabel,
  footnote,
  onDone,
}) {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await db.joinWaitlist({
        email: trimmed,
        reason,
        monthsPp: monthsPp === "" || monthsPp == null ? null : Number(monthsPp),
      });
      setDone(true);
      onDone?.();
    } catch (e) {
      console.error("waitlist failed", e);
      setError("Couldn't save that — try again in a moment.");
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div style={{ fontSize: 14.5, lineHeight: 1.55, color: T.accentDeep, fontWeight: 700 }}>
        {reason === "pregnant"
          ? "You're on the list. Congratulations again 🤍"
          : "You're on the list — we'll be in touch when it's time."}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input
          style={{ ...inputStyle, flex: 1, minWidth: 160, marginBottom: 0 }}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <Btn small disabled={busy || !email.trim()} onClick={submit}>
          {busy ? "Saving…" : buttonLabel}
        </Btn>
      </div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45 }}>{footnote}</div>
      {error && (
        <div style={{ marginTop: 8, fontSize: 13, color: T.amber }}>{error}</div>
      )}
    </div>
  );
}

export function IntakeFlow({ profile, step, setStep, set, onSubmit, onEligibilityDecline, refundIssued = false }) {
  const steps = ["About you", "You right now", "Your goal", "Your tastes"];
  const [earlyGateShown, setEarlyGateShown] = useState(false);
  const declinedOnce = useRef(false);

  const monthsNum = Number(profile.monthsPP);
  const monthsValid = profile.monthsPP !== "" && !Number.isNaN(monthsNum);
  const earlyNursing = profile.breastfeeding === true && monthsValid && monthsNum < 3;

  const fireDecline = (reason) => {
    if (declinedOnce.current) return;
    declinedOnce.current = true;
    onEligibilityDecline?.(reason);
  };

  useEffect(() => {
    if (profile.pregnant === true) fireDecline("pregnant");
  }, [profile.pregnant]);

  useEffect(() => {
    if (earlyGateShown && earlyNursing) fireDecline("early");
  }, [earlyGateShown, earlyNursing]);

  const setPregnant = (v) => {
    set("pregnant", v);
    if (v === true) {
      set("breastfeeding", null);
      set("monthsPP", "");
      setEarlyGateShown(false);
    }
  };

  const setBreastfeeding = (v) => {
    set("breastfeeding", v);
    setEarlyGateShown(false);
    if (v === false) set("monthsPP", "");
  };

  const tryContinueStep1 = () => {
    if (profile.pregnant !== false) return;
    if (profile.breastfeeding === false) {
      set("monthsPP", "");
      setEarlyGateShown(false);
      setStep(2);
      return;
    }
    if (profile.breastfeeding === true) {
      if (!monthsValid) return;
      if (monthsNum < 3) {
        setEarlyGateShown(true);
        return;
      }
      setEarlyGateShown(false);
      setStep(2);
    }
  };

  // Once the early card has been shown, keep Continue disabled while still under 3.
  // Before first Continue tap with < 3, Continue is also disabled via canContinueStep1 when months < 3.
  // Spec: validate on Continue tap — so allow Continue to be clickable when months filled even if < 3,
  // and on tap show the card. Re-read:
  // "Validate on Continue tap, not per keystroke"
  // "If < 3: stay on the page and show the inline card; Continue remains disabled while the value is under 3."
  // So: initially with "2" typed, Continue should be enabled to tap; after tap, card shows and Continue disabled until >= 3.

  const continueEnabledStep1 = () => {
    if (profile.pregnant !== false) return false;
    if (profile.breastfeeding === false) return true;
    if (profile.breastfeeding === true) {
      if (!monthsValid) return false;
      if (earlyGateShown && monthsNum < 3) return false;
      // Before card: allow click even if < 3 so we can show the card
      if (!earlyGateShown) return true;
      return monthsNum >= 3;
    }
    return false;
  };

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
              <Chip active={profile.pregnant === true} onClick={() => setPregnant(true)}>Yes</Chip>
              <Chip active={profile.pregnant === false} onClick={() => setPregnant(false)}>No</Chip>
            </div>
          </Field>

          {profile.pregnant === true && (
            <div style={{
              background: T.accentSoft, borderRadius: 14, padding: "14px 16px", marginBottom: 4,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
                🤍 Congratulations, mama.
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 14px" }}>
                This program isn&apos;t recommended during pregnancy — your body needs abundance right now, not a deficit.
                Come back after baby arrives; we&apos;d love to have you then.
              </p>
              <WaitlistCapture
                reason="pregnant"
                buttonLabel="Keep me posted"
                footnote="Leave your email and Callie will check in when the time is right."
              />
              {refundIssued && (
                <p style={{
                  fontSize: 13.5, lineHeight: 1.5, color: T.accentDeep, fontWeight: 700,
                  margin: "12px 0 0",
                }}>
                  {REFUND_COPY}
                </p>
              )}
            </div>
          )}

          {profile.pregnant === false && (
            <>
              <Field label="Are you currently breastfeeding?">
                <div style={{ display: "flex", gap: 8 }}>
                  <Chip active={profile.breastfeeding === true} onClick={() => setBreastfeeding(true)}>Yes</Chip>
                  <Chip active={profile.breastfeeding === false} onClick={() => setBreastfeeding(false)}>No</Chip>
                </div>
              </Field>

              {profile.breastfeeding === true && (
                <>
                  <Field label="How many months ago was your baby born?">
                    <input
                      style={inputStyle}
                      inputMode="numeric"
                      value={profile.monthsPP}
                      onChange={(e) => {
                        set("monthsPP", e.target.value);
                        // If she edits up to 3+, clear the gate card
                        const n = Number(e.target.value);
                        if (e.target.value !== "" && !Number.isNaN(n) && n >= 3) {
                          setEarlyGateShown(false);
                        }
                      }}
                      placeholder="12"
                    />
                  </Field>
                  <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
                    Your macros are set gently while you&apos;re nursing. Milk supply comes first, always.
                  </div>
                </>
              )}

              {earlyGateShown && earlyNursing && (
                <div style={{
                  background: T.amberSoft, borderRadius: 14, padding: "14px 16px", marginBottom: 14,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
                    Not yet — and that&apos;s on purpose.
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 14px" }}>
                    You&apos;re under three months postpartum while nursing, and we won&apos;t risk your milk supply while it&apos;s still establishing.
                    Your body is doing its most important work right now.
                  </p>
                  <WaitlistCapture
                    reason="early_nursing"
                    monthsPp={profile.monthsPP}
                    buttonLabel="Remind me when it's time"
                    footnote="We'll reach out as you pass the three-month mark."
                  />
                  {refundIssued && (
                    <p style={{
                      fontSize: 13.5, lineHeight: 1.5, color: T.accentDeep, fontWeight: 700,
                      margin: "12px 0 0",
                    }}>
                      {REFUND_COPY}
                    </p>
                  )}
                </div>
              )}

              <Btn
                style={{ width: "100%" }}
                disabled={!continueEnabledStep1()}
                onClick={tryContinueStep1}
              >
                Continue
              </Btn>
            </>
          )}
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
            Last one, and it&apos;s the fun one. Tell Callie what you actually love to eat — your meal plan gets adapted to your tastes, not the other way around.
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
          <Field label="Anything about your season of life Callie should know?">
            <textarea
              style={{ ...inputStyle, minHeight: 88, resize: "vertical", fontFamily: F }}
              value={profile.seasonNote || ""}
              onChange={(e) => set("seasonNote", e.target.value)}
              placeholder="Optional — e.g. cleared by my OB at 8 weeks, not nursing"
            />
          </Field>
          <Btn style={{ width: "100%", marginTop: 4 }} onClick={onSubmit}>Send to Callie</Btn>
        </Card>
      )}
    </Shell>
  );
}
