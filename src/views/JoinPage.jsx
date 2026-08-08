import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { CONFIG } from "../config";
import { fetchCheckoutQuote, startCheckout } from "../lib/checkout";
import { PATHS } from "../routing";

const LAB_ADDON_PRICE = 349;
/** Marketing quiz on www — still the preferred path; not required when OPEN_WITHOUT_QUIZ=true. */
const QUIZ_URL = "https://www.macrosandmamas.com/quiz";
const COHORT_LABEL = CONFIG.COHORT_LABEL || "Cohort 2";
const COHORT_START = CONFIG.COHORT_START || "Monday, Aug 31";
const COHORT_START_SHORT = CONFIG.COHORT_START_SHORT || "August 31";
const COHORT_START_COMPACT = CONFIG.COHORT_START_COMPACT || "Aug 31";

/** Unpaid signed-in users finish joining here before intake. */
export function JoinPage({ onRefresh, profileCreatedAt = null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState("");
  const [labReview, setLabReview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError("");
    fetchCheckoutQuote()
      .then((q) => {
        if (!cancelled) {
          setQuote(q);
          setQuoteError("");
        }
      })
      .catch((e) => {
        console.error("checkout quote failed", e);
        if (!cancelled) {
          setQuote(null);
          setQuoteError(e?.message || "quote failed");
        }
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => { cancelled = true; };
  }, [profileCreatedAt]);

  const amount = quote?.amount;
  const total =
    amount != null ? amount + (labReview ? LAB_ADDON_PRICE : 0) : null;
  const payLabel = total != null ? `Pay $${total} — lock my spot` : "Pay — lock my spot";
  const finishLabel = total != null ? `Finish paying $${total}` : "Finish paying";

  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      await startCheckout({ labReview });
    } catch (e) {
      console.error("checkout failed", e);
      const msg = String(e?.message || "");
      setError(
        msg.includes("quiz_required") || e?.status === 403
          ? "This early rate unlocks after the free ranges quiz. Take the quiz with this same email, then come back to pay."
          : msg.includes("lab add-on")
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

  const refreshBtn = onRefresh ? (
    <button
      type="button"
      onClick={onRefresh}
      style={{
        display: "block",
        margin: "14px auto 0",
        background: "none",
        border: "none",
        color: T.inkSoft,
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        textDecoration: "underline",
      }}
    >
      I already paid — refresh
    </button>
  ) : null;

  // Quiz gate: no quote until they finish the ranges quiz with this email.
  if (!quoteLoading && !quote && (quoteError.includes("quiz_required") || quoteError.includes("enrollment closed"))) {
    return (
      <Shell>
        <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 10px" }}>
            Unlock your $249 rate
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft, margin: "0 0 16px" }}>
            The early rate ($50 off full price) is exclusive to women who finish the free
            ranges quiz. Take it with <strong style={{ color: T.ink }}>this same email</strong>,
            see your preview, then come back here to pre-pay and lock your cohort spot.
          </p>
          <a
            href={QUIZ_URL}
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
            Take the free quiz
          </a>
          <p style={{ marginTop: 14, fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
            Already finished? Refresh this page — checkout unlocks once your quiz email matches.
          </p>
          {refreshBtn}
        </Card>
      </Shell>
    );
  }

  if (!quoteLoading && !quote && quoteError) {
    return (
      <Shell>
        <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 10px" }}>
            Couldn&apos;t load your price
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft, margin: "0 0 16px" }}>
            Try refresh in a moment. If it keeps happening, take the ranges quiz first, then return to pay.
          </p>
          <a href={QUIZ_URL} style={{ color: T.accent, fontWeight: 700 }}>
            Get your macro ranges
          </a>
          {refreshBtn}
        </Card>
      </Shell>
    );
  }

  const isFounding = quote?.tier === "founding";
  const openBlurb = isFounding
    ? `Founding rate $${amount}. After checkout you’ll complete a short intake so Callie can build your macros.`
    : amount != null
      ? `You’re locking ${COHORT_LABEL} — starts ${COHORT_START}. $${amount} for 8 weeks ($50 off the full $299). After checkout you’ll complete a short intake; Callie approves your final ranges before day one.`
      : `You’re locking ${COHORT_LABEL} — starts ${COHORT_START}. After checkout you’ll complete a short intake so Callie can build your macros.`;

  return (
    <Shell>
      <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: T.accentDeep || T.accent,
            marginBottom: 6,
          }}
        >
          {COHORT_LABEL} · starts {COHORT_START}
        </div>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>
          {isFounding
            ? (total != null ? `Finish joining — $${total}` : "Finish joining")
            : (total != null
              ? `Lock your ${COHORT_START_COMPACT} spot — $${total}`
              : `Lock your ${COHORT_START_COMPACT} spot`)}
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
          {quoteLoading ? "Loading your price…" : openBlurb}
        </p>
        {labToggle}
        <Btn style={{ width: "100%", marginTop: 14 }} disabled={busy || quoteLoading || !amount} onClick={pay}>
          {busy
            ? "Redirecting to Stripe…"
            : quoteLoading
              ? "Loading price…"
              : isFounding
                ? finishLabel
                : payLabel}
        </Btn>
        {error && (
          <div style={{ marginTop: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>{error}</div>
        )}
        {!isFounding && (
          <p style={{ marginTop: 14, fontSize: 13, color: T.inkSoft, lineHeight: 1.45 }}>
            You’re pre-paying for <strong style={{ color: T.ink }}>{COHORT_LABEL}</strong>
            {" "}— starts <strong style={{ color: T.ink }}>{COHORT_START_SHORT}</strong>.
            Took the quiz? Use that same email here so we can keep your ranges attached.
          </p>
        )}
        {refreshBtn}
        <Link
          to={PATHS.dashboard}
          style={{
            display: "block",
            marginTop: 16,
            fontWeight: 700,
            fontSize: 14,
            color: T.accent,
            textDecoration: "underline",
          }}
        >
          Back
        </Link>
      </Card>
    </Shell>
  );
}
