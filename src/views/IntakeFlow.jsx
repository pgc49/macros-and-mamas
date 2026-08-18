import { useEffect, useRef, useState } from "react";
import { FD, T, F } from "../theme/tokens";
import { Shell, Card, Btn, Field, Chip, inputStyle } from "../components/ui";
import { ageFromDateOfBirth } from "../db/db";
import { supabase } from "../lib/supabase";
import { CONFIG } from "../config";
import { mapLeadToIntakePatch, mergeQuizPrefill } from "../lib/quizLeadPrefill";

/** Full intake — no eligibility denials. Callie reviews flags in admin. */
export function IntakeFlow({ profile, step, setStep, set, setProfile, onSubmit }) {
  const steps = ["About you", "You right now", "Your goal", "Your tastes"];
  const [quizPrefillNote, setQuizPrefillNote] = useState("");
  const prefillTried = useRef(false);

  useEffect(() => {
    if (prefillTried.current) return undefined;
    prefillTried.current = true;
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const resp = await fetch(CONFIG.QUIZ_LEAD_ENDPOINT, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!resp.ok) return;
        const data = await resp.json().catch(() => ({}));
        if (cancelled || !data?.lead) return;
        const { patch } = mapLeadToIntakePatch(data.lead);
        if (setProfile) {
          let appliedKeys = [];
          setProfile((prev) => {
            const merged = mergeQuizPrefill(prev, patch);
            appliedKeys = merged.appliedKeys;
            return merged.next;
          });
          if (!cancelled && appliedKeys.length) {
            setQuizPrefillNote(
              "We pulled these from your quiz — change anything that's different now.",
            );
          }
        }
      } catch (e) {
        console.error("quiz lead prefill failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setProfile]);

  const monthsNum = Number(profile.monthsPP);
  const monthsValid = profile.monthsPP !== "" && !Number.isNaN(monthsNum);
  const dob = String(profile.dateOfBirth || "").trim();
  const dobValid = !!ageFromDateOfBirth(dob);

  const setPregnant = (v) => {
    set("pregnant", v);
    if (v === true) {
      set("breastfeeding", null);
      set("monthsPP", "");
    }
  };

  const setBreastfeeding = (v) => {
    set("breastfeeding", v);
    if (v === false) set("monthsPP", "");
  };

  const continueEnabledStep1 = () => {
    if (profile.pregnant === true) return true;
    if (profile.pregnant !== false) return false;
    if (profile.breastfeeding === false) return true;
    if (profile.breastfeeding === true) return monthsValid;
    return false;
  };

  const goStep2 = () => {
    if (!continueEnabledStep1()) return;
    if (profile.pregnant === true || profile.breastfeeding === false) {
      set("monthsPP", "");
    }
    setStep(2);
  };

  const prefillBanner = quizPrefillNote ? (
    <div
      style={{
        background: T.sageSoft || "rgba(95,129,104,0.12)",
        borderRadius: 14,
        padding: "12px 14px",
        marginBottom: 14,
        fontSize: 13.5,
        lineHeight: 1.5,
        color: T.ink,
      }}
    >
      {quizPrefillNote}
    </div>
  ) : null;

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
          {prefillBanner}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="First name">
              <input
                style={inputStyle}
                value={profile.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="First"
                autoComplete="given-name"
              />
            </Field>
            <Field label="Last name">
              <input
                style={inputStyle}
                value={profile.lastName || ""}
                onChange={(e) => set("lastName", e.target.value)}
                placeholder="Last"
                autoComplete="family-name"
              />
            </Field>
          </div>
          <Field label="Date of birth">
            <input
              style={inputStyle}
              type="date"
              value={dob}
              onChange={(e) => set("dateOfBirth", e.target.value)}
              autoComplete="bday"
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          {dobValid && (
            <div style={{ fontSize: 13, color: T.inkSoft, marginTop: -6, marginBottom: 12 }}>
              Age {ageFromDateOfBirth(dob)}
            </div>
          )}
          <Field label="Current weight (lbs)"><input style={inputStyle} inputMode="numeric" value={profile.currentWeight} onChange={(e) => set("currentWeight", e.target.value)} placeholder="162" /></Field>
          <Field label="Goal weight (lbs) — where you feel your best"><input style={inputStyle} inputMode="numeric" value={profile.goalWeight} onChange={(e) => set("goalWeight", e.target.value)} placeholder="145" /></Field>
          <Field label="Cell number">
            <input style={inputStyle} inputMode="tel" value={profile.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 555-5555" />
          </Field>
          <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
            Callie may text you if she needs to reach you. Your group chat lives in Messages in the app — other mamas won&apos;t see this number.
          </div>
          <Btn
            style={{ width: "100%", marginTop: 4 }}
            disabled={
              !String(profile.name || "").trim()
              || !String(profile.lastName || "").trim()
              || !dobValid
              || !profile.goalWeight
              || !profile.currentWeight
              || !profile.phone
            }
            onClick={() => setStep(1)}
          >
            Continue
          </Btn>
        </Card>
      )}

      {step === 1 && (
        <Card>
          {prefillBanner}
          <Field label="Are you currently pregnant?">
            <div style={{ display: "flex", gap: 8 }}>
              <Chip active={profile.pregnant === true} onClick={() => setPregnant(true)}>Yes</Chip>
              <Chip active={profile.pregnant === false} onClick={() => setPregnant(false)}>No</Chip>
            </div>
          </Field>

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
                      onChange={(e) => set("monthsPP", e.target.value)}
                      placeholder="12"
                    />
                  </Field>
                  <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
                    Your macros are set gently while you&apos;re nursing. Milk supply comes first, always.
                  </div>
                </>
              )}
            </>
          )}

          <Btn
            style={{ width: "100%", marginTop: profile.pregnant === true ? 8 : 0 }}
            disabled={!continueEnabledStep1()}
            onClick={goStep2}
          >
            Continue
          </Btn>
        </Card>
      )}

      {step === 2 && (
        <Card>
          {prefillBanner}
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
          <Field label="How do you eat?">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip active={profile.diet === "none"} onClick={() => set("diet", "none")}>No restrictions</Chip>
              <Chip active={profile.diet === "pescatarian"} onClick={() => set("diet", "pescatarian")}>Pescatarian</Chip>
              <Chip active={profile.diet === "vegetarian"} onClick={() => set("diet", "vegetarian")}>Vegetarian</Chip>
            </div>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.45 }}>
              You can change this later in Meals → Food prefs. Eggs &amp; dairy are fine on vegetarian unless you mark allergens.
            </div>
          </Field>
          <Btn style={{ width: "100%", marginTop: 4 }} onClick={() => setStep(3)}>Continue</Btn>
        </Card>
      )}

      {step === 3 && (
        <Card>
          {prefillBanner}
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
          <Field label="Snack foods you love">
            <input style={inputStyle} value={profile.prefS || ""} onChange={(e) => set("prefS", e.target.value)} placeholder="yogurt, apple + peanut butter, protein shake" />
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
