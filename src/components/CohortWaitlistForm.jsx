import { useState } from "react";
import { T, F } from "../theme/tokens";
import { Btn } from "./ui";
import { db } from "../db/db";
import { CONFIG } from "../config";

/**
 * Homepage waitlist capture for the next cohort.
 * variant: "hero" (on dark scrim) | "footer" (on page body)
 */
export function CohortWaitlistForm({ variant = "hero", source = "homepage" }) {
  const isHero = variant === "hero";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Hero sits on a dark mobile scrim; desktop hero copy is on light bg
  // (labels flip via .mm-waitlist-form--hero CSS in SalesPage).
  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1.5px solid ${T.border}`,
    background: "#fff",
    color: T.ink,
    fontFamily: F,
    fontSize: 15,
    outline: "none",
  };

  const labelStyle = {
    display: "block",
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: "0.02em",
    marginBottom: 5,
    color: T.inkSoft,
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    const first = firstName.trim();
    const last = lastName.trim();
    const em = email.trim().toLowerCase();
    const ph = phone.trim();
    if (first.length < 1) {
      setError("Please enter your first name.");
      return;
    }
    if (last.length < 1) {
      setError("Please enter your last name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError("Please enter a valid email.");
      return;
    }
    if (ph.replace(/\D/g, "").length < 7) {
      setError("Please enter a phone number we can reach you on.");
      return;
    }
    setBusy(true);
    try {
      await db.joinCohortWaitlist({
        firstName: first,
        lastName: last,
        email: em,
        phone: ph,
        cohort: CONFIG.WAITLIST_COHORT,
        source,
      });
      setDone(true);
    } catch (err) {
      console.error("cohort waitlist failed", err);
      const msg = String(err?.message || "");
      if (/duplicate|unique|already/i.test(msg)) {
        setDone(true);
      } else {
        setError("Couldn't save that — try again in a moment.");
      }
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div
        className={isHero ? "mm-waitlist-done mm-waitlist-done--hero" : "mm-waitlist-done"}
        role="status"
        style={{
          padding: isHero ? "14px 16px" : "16px 18px",
          borderRadius: 12,
          background: T.sageSoft,
          color: T.sage,
          fontSize: 14.5,
          lineHeight: 1.5,
          fontWeight: 600,
        }}
      >
        You&apos;re on the list. We&apos;ll email you first when cohort two opens.
      </div>
    );
  }

  return (
    <form
      className={isHero ? "mm-waitlist-form mm-waitlist-form--hero" : "mm-waitlist-form"}
      onSubmit={submit}
      noValidate
      style={{ display: "grid", gap: 10, maxWidth: 360 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ margin: 0 }}>
          <span className="mm-waitlist-label" style={labelStyle}>First name</span>
          <input
            style={fieldStyle}
            type="text"
            name="first_name"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First"
            disabled={busy}
          />
        </label>
        <label style={{ margin: 0 }}>
          <span className="mm-waitlist-label" style={labelStyle}>Last name</span>
          <input
            style={fieldStyle}
            type="text"
            name="last_name"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last"
            disabled={busy}
          />
        </label>
      </div>
      <label style={{ margin: 0 }}>
        <span className="mm-waitlist-label" style={labelStyle}>Email</span>
        <input
          style={fieldStyle}
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          disabled={busy}
        />
      </label>
      <label style={{ margin: 0 }}>
        <span className="mm-waitlist-label" style={labelStyle}>Phone</span>
        <input
          style={fieldStyle}
          type="tel"
          name="phone"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 555-5555"
          disabled={busy}
        />
      </label>
      <Btn
        type="submit"
        disabled={busy}
        style={{
          width: "100%",
          marginTop: 2,
          ...(isHero ? { background: "#fff", color: T.accentDeep } : {}),
        }}
      >
        {busy ? "Saving…" : "Register for priority access"}
      </Btn>
      {error && (
        <div
          className="mm-waitlist-error"
          style={{
            fontSize: 13.5,
            lineHeight: 1.45,
            color: T.amber,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}
    </form>
  );
}
