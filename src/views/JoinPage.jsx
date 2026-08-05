import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { fetchCheckoutQuote, startCheckout } from "../lib/checkout";
import { canFinishPaying, isEnrollmentOpen } from "../config";
import { PATHS } from "../routing";

const LAB_ADDON_PRICE = 299;

/** Unpaid signed-in users finish joining here before intake. */
export function JoinPage({ onRefresh, profileCreatedAt = null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [labReview, setLabReview] = useState(false);
  const enrollmentOpen = isEnrollmentOpen();
  const allowPay = canFinishPaying(profileCreatedAt);

  useEffect(() => {
    if (!enrollmentOpen && !allowPay) {
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    fetchCheckoutQuote()
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch((e) => {
        console.error("checkout quote failed", e);
        if (!cancelled && e?.status !== 403) {
          setError("Couldn't load your price. Try refresh.");
        }
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => { cancelled = true; };
  }, [enrollmentOpen, allowPay]);

  const amount = quote?.amount;
  const total =
    amount != null ? amount + (labReview ? LAB_ADDON_PRICE : 0) : null;
  const payLabel = total != null ? `Pay $${total} — join` : "Pay — join";
  const finishLabel = total != null ? `Finish paying $${total}` : "Finish paying";

  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      await startCheckout({ labReview });
    } catch (e) {
      console.error("checkout failed", e);
      setError(
        e?.message?.includes("enrollment closed")
          || e?.status === 403
          ? "New spots aren’t open yet — join the waitlist and we’ll email you first."
          : e?.message?.includes("lab add-on")
            ? "Lab Review isn’t available right now. Uncheck it or try again later."
            : "Couldn't start checkout. Try again in a moment.",
      );
      setBusy(false);
    }
  };

  const labToggle = (
    <label
      style={{
        display: "block",
        textAlign: "left",
        marginTop: 18,
        padding: "14px 16px",
        borderRadius: 16,
        border: `1.5px dashed ${labReview ? T.accent : T.border}`,
        background: labReview ? "rgba(180,65,107,0.06)" : T.bg || "#faf5f2",
        cursor: "pointer",
      }}
    >
      <span style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={labReview}
          onChange={(e) => setLabReview(e.target.checked)}
          style={{ marginTop: 4, width: 18, height: 18, accentColor: T.accent }}
        />
        <span style={{ flex: 1 }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <strong style={{ fontSize: 15.5, color: T.ink }}>Add The Lab Review</strong>
            <span style={{ fontFamily: FD, fontSize: 20, color: T.ink }}>${LAB_ADDON_PRICE}</span>
          </span>
          <span style={{ display: "block", marginTop: 6, fontSize: 13.5, lineHeight: 1.5, color: T.inkSoft }}>
            Optional. Callie reads your bloodwork, records a voice memo walkthrough,
            answers questions in Messages, and tunes your ranges. Educational analysis,
            not medical diagnosis.
          </span>
        </span>
      </span>
    </label>
  );

  // Founding closed: only pre-close unpaid accounts may finish paying.
  if (!enrollmentOpen && !allowPay) {
    return (
      <Shell>
        <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 10px" }}>
            Founding group is closed
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft, margin: "0 0 16px" }}>
            New spots open with cohort two. Join the waitlist for priority access — we&apos;ll email you
            when it&apos;s time to create your account and pay.
          </p>
          <Link
            to={PATHS.waitlist}
            style={{
              display: "inline-block",
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 18px",
              borderRadius: 999,
              background: T.accent,
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            Join the cohort two waitlist
          </Link>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              style={{
                display: "block", margin: "14px auto 0", background: "none", border: "none",
                color: T.inkSoft, fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline",
              }}
            >
              I already paid — refresh
            </button>
          )}
        </Card>
      </Shell>
    );
  }

  if (!enrollmentOpen && allowPay) {
    return (
      <Shell>
        <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 10px" }}>
            Finish joining
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft, margin: "0 0 16px" }}>
            You started before the founding group closed — you can still finish paying
            {amount != null ? ` at the founding rate ($${amount})` : " below"}.
          </p>
          {labToggle}
          <Btn style={{ width: "100%", marginTop: 14 }} disabled={busy || quoteLoading} onClick={pay}>
            {busy ? "Redirecting to Stripe…" : quoteLoading ? "Loading price…" : finishLabel}
          </Btn>
          {error && (
            <div style={{ marginTop: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>{error}</div>
          )}
          <Link
            to={PATHS.waitlist}
            style={{
              display: "block",
              marginTop: 16,
              fontWeight: 700,
              fontSize: 14,
              color: T.accent,
              textDecoration: "underline",
            }}
          >
            Or join the cohort two waitlist
          </Link>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              style={{
                display: "block", margin: "14px auto 0", background: "none", border: "none",
                color: T.inkSoft, fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline",
              }}
            >
              I already paid — refresh
            </button>
          )}
        </Card>
      </Shell>
    );
  }

  const openBlurb = quote?.tier === "waitlist"
    ? `Your waitlist early rate is $${amount} (full price is $299). After checkout you’ll complete a short intake so Callie can build your macros.`
    : quote?.tier === "founding"
      ? `Founding rate $${amount}. After checkout you’ll complete a short intake so Callie can build your macros.`
      : amount != null
        ? `Secure your spot for $${amount}. After checkout you’ll complete a short intake so Callie can build your macros.`
        : "Secure your spot. After checkout you’ll complete a short intake so Callie can build your macros.";

  return (
    <Shell>
      <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>
          {total != null ? `Finish joining — $${total}` : "Finish joining"}
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
          {quoteLoading ? "Loading your price…" : openBlurb}
        </p>
        {labToggle}
        <Btn style={{ width: "100%", marginTop: 14 }} disabled={busy || quoteLoading || !amount} onClick={pay}>
          {busy ? "Redirecting to Stripe…" : quoteLoading ? "Loading price…" : payLabel}
        </Btn>
        {error && (
          <div style={{ marginTop: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>{error}</div>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            style={{
              display: "block", margin: "14px auto 0", background: "none", border: "none",
              color: T.accent, fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline",
            }}
          >
            I already paid — refresh
          </button>
        )}
      </Card>
    </Shell>
  );
}
