import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { CONFIG } from "../config";
import { fetchCheckoutQuote, startCheckout } from "../lib/checkout";
import { useAuth } from "../auth/useAuth.jsx";
import {
  emailsMatch,
  normalizeEmail,
  quizSignInHref,
  rememberQuizEmail,
  resolveQuizEmail,
} from "../lib/quizCheckout";

const LAB_ADDON_PRICE = 349;
const COHORT_START = CONFIG.COHORT_START || "Monday, Aug 31";
const COHORT_START_SHORT = CONFIG.COHORT_START_SHORT || "August 31";
const COHORT_START_COMPACT = CONFIG.COHORT_START_COMPACT || "Aug 31";

/** Unpaid signed-in users finish joining here before intake. */
export function JoinPage({ profileCreatedAt = null }) {
  const { user, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const quizEmail = resolveQuizEmail(searchParams);
  const sessionEmail = normalizeEmail(user?.email);
  const emailMismatch = Boolean(
    quizEmail && sessionEmail && !emailsMatch(sessionEmail, quizEmail),
  );

  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState("");
  const [labReview, setLabReview] = useState(false);
  const [referralCode, setReferralCode] = useState(() => {
    const fromUrl = String(
      searchParams.get("ref") || searchParams.get("code") || "",
    ).trim().toUpperCase();
    return fromUrl;
  });

  useEffect(() => {
    if (quizEmail) rememberQuizEmail(quizEmail);
  }, [quizEmail]);

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
  }, [profileCreatedAt, sessionEmail]);

  const switchToQuizEmail = async () => {
    if (!quizEmail) return;
    setSwitching(true);
    setError("");
    try {
      rememberQuizEmail(quizEmail);
      await signOut();
      window.location.assign(quizSignInHref(quizEmail, "create"));
    } catch (e) {
      console.error("switch to quiz email failed", e);
      setError("Couldn't switch accounts. Sign out from your profile icon, then sign in with your quiz email.");
      setSwitching(false);
    }
  };

  const amount = quote?.amount;
  const total =
    amount != null ? amount + (labReview ? LAB_ADDON_PRICE : 0) : null;
  const payLabel = total != null ? `Pay $${total} — lock my spot` : "Pay — lock my spot";
  const finishLabel = total != null ? `Finish paying $${total}` : "Finish paying";

  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      await startCheckout({
        labReview,
        referralCode: referralCode.trim() || undefined,
      });
    } catch (e) {
      console.error("checkout failed", e);
      const msg = String(e?.message || "");
      setError(
        msg.includes("quiz_required") || e?.status === 403
          ? "Couldn't start checkout at this rate. Try again in a moment, or pay the listed price below."
          : msg.includes("lab add-on")
            ? "Lab Review isn’t available right now. Uncheck it or try again later."
            : /referral|own code/i.test(msg)
              ? msg
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

  if (emailMismatch) {
    return (
      <Shell>
        <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 10px" }}>
            Use your quiz email to checkout
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft, margin: "0 0 16px" }}>
            Your early rate is unlocked for{" "}
            <strong style={{ color: T.ink }}>{quizEmail}</strong>.
            {" "}You’re signed in as{" "}
            <strong style={{ color: T.ink }}>{sessionEmail}</strong>
            {" "}— switch accounts to check out with the email that took the quiz.
          </p>
          <Btn style={{ width: "100%" }} disabled={switching} onClick={switchToQuizEmail}>
            {switching ? "Switching…" : "Continue with quiz email"}
          </Btn>
          {error && (
            <div style={{ marginTop: 12, fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>{error}</div>
          )}
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
            Try again in a moment. If it keeps happening, sign out from your profile icon and sign back in.
          </p>
        </Card>
      </Shell>
    );
  }

  const isFounding = quote?.tier === "founding";
  const isEarly = quote?.tier === "waitlist";
  const isFull = quote?.tier === "full";
  const openBlurb = isFounding
    ? `Founding rate $${amount}. After checkout you’ll complete a short intake so Callie can build your macros.`
    : isEarly && amount != null
      ? `You’re locking your spot — starts ${COHORT_START}. Early rate $${amount} for 8 weeks. After checkout you’ll complete a short intake; Callie approves your final ranges before day one.`
      : isFull && amount != null
        ? `You’re locking your spot — starts ${COHORT_START}. Full rate $${amount} for 8 weeks. After checkout you’ll complete a short intake so Callie can build your macros.`
        : `You’re locking your spot — starts ${COHORT_START}. After checkout you’ll complete a short intake so Callie can build your macros.`;

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
          Starts {COHORT_START}
        </div>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>
          {isFounding
            ? (total != null ? `Finish joining — $${total}` : "Finish joining")
            : (total != null
              ? `Lock your ${COHORT_START_COMPACT} spot — $${total}`
              : `Lock your ${COHORT_START_COMPACT} spot`)}
        </h2>
        {sessionEmail && (
          <p style={{ fontSize: 13.5, lineHeight: 1.45, color: T.inkSoft, margin: "0 0 8px" }}>
            Signed in as <strong style={{ color: T.ink }}>{sessionEmail}</strong>
          </p>
        )}
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
          {quoteLoading ? "Loading your price…" : openBlurb}
        </p>
        {isEarly && (
          /* Checkout is the only referral entry; quiz gate does not collect a code. */
          <details
            className="mm-ref-code"
            defaultOpen={Boolean(referralCode)}
            style={{
              display: "block",
              textAlign: "left",
              marginTop: 16,
            }}
          >
            <style>{`
              .mm-ref-code > summary {
                list-style: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                font-size: 13.5px;
                font-weight: 700;
                color: ${T.ink};
              }
              .mm-ref-code > summary::-webkit-details-marker { display: none; }
              .mm-ref-code > summary::after {
                content: "▾";
                font-size: 12px;
                font-weight: 400;
                color: ${T.inkSoft};
                line-height: 1;
                transition: transform .15s ease;
              }
              .mm-ref-code[open] > summary::after { transform: rotate(180deg); }
            `}</style>
            <summary>Referral code</summary>
            <input
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              placeholder="e.g. SARAH25"
              autoComplete="off"
              spellCheck={false}
              aria-label="Referral code"
              style={{
                display: "block",
                width: "100%",
                marginTop: 8,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1.5px solid ${T.border}`,
                fontSize: 16,
                fontFamily: FD,
                letterSpacing: 0.5,
                color: T.ink,
                background: "#fff",
                boxSizing: "border-box",
              }}
            />
          </details>
        )}
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
            You’re pre-paying for your spot
            {" "}— starts <strong style={{ color: T.ink }}>{COHORT_START_SHORT}</strong>.
            {isEarly ? (
              <> Keep using this same email so your quiz ranges stay attached.</>
            ) : null}
          </p>
        )}
      </Card>
    </Shell>
  );
}
