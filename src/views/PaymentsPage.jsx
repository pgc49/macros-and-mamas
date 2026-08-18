import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { FD, F, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { PATHS } from "../routing";
import { useAuth } from "../auth/useAuth.jsx";
import {
  canOpenBillingPortal,
  fetchBillingSummary,
  openBillingPortal,
  startMembershipCheckout,
} from "../lib/billing";

function money(amount, currency = "usd") {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(Number(amount));
  } catch {
    return `$${Number(amount).toFixed(0)}`;
  }
}

function moneyCents(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(Number(cents) / 100);
  } catch {
    return `$${(Number(cents) / 100).toFixed(2)}`;
  }
}

function when(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Payments — 8-week program history + alumni membership opt-in / status.
 */
export function PaymentsPage() {
  const { user, profile, loading: authLoading, isAdmin, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalNote, setPortalNote] = useState("");
  const [subBusy, setSubBusy] = useState(false);
  const [subNote, setSubNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authLoading || !user) {
        if (!authLoading) setLoading(false);
        return;
      }
      try {
        if (searchParams.get("membership") === "success") {
          await refreshProfile?.();
        }
        const summary = await fetchBillingSummary();
        if (!cancelled) setData(summary);
      } catch (e) {
        console.error("billing load failed", e);
        if (!cancelled) setErr(e?.message || "Couldn't load payments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, searchParams, refreshProfile]);

  if (authLoading || loading) {
    return (
      <Shell>
        <Card style={{ marginTop: 24 }}>
          <div style={{ fontFamily: FD, fontSize: 20, color: T.inkSoft }}>Loading…</div>
        </Card>
      </Shell>
    );
  }

  if (!user) {
    return <Navigate to={PATHS.signin} replace state={{ from: PATHS.accountPayments }} />;
  }
  if (profile?.refunded) return <Navigate to={PATHS.goodbye} replace />;
  if (!profile?.paid && !isAdmin) return <Navigate to={PATHS.join} replace />;

  const program = data?.program;
  const subscription = data?.subscription;
  const payments = data?.payments || [];
  const credits = data?.credits;

  const phaseLabel = program?.phase === "program_complete"
    ? "8-week program complete"
    : program?.phase === "in_program" && program?.week > 0
      ? `Week ${program.week} of 8`
      : program?.phase === "in_program" && program?.week === 0
        ? "Early access"
        : program?.phase === "paid_access"
          ? "Program access"
          : "Program";

  const programRange = program?.programStart && (program?.programLastDay || program?.programEnd)
    ? ` · ${when(program.programStart)} – ${when(program.programLastDay || program.programEnd)}`
    : program?.paidAt
      ? ` · started ${when(program.paidAt)}`
      : "";

  const openPortal = async () => {
    setPortalNote("");
    setPortalBusy(true);
    try {
      await openBillingPortal();
    } catch (e) {
      setPortalNote(
        e?.message
        || "Card updates via Stripe Portal aren’t set up yet. Past payments still show below.",
      );
      setPortalBusy(false);
    }
  };

  const subscribe = async () => {
    setSubNote("");
    setSubBusy(true);
    try {
      await startMembershipCheckout();
    } catch (e) {
      setSubNote(e?.message || "Couldn't start membership checkout.");
      setSubBusy(false);
    }
  };

  const benefits = subscription?.benefits || [
    "Keep your macros, meal logging, and full progress history",
    "Alumni community chat with Callie and other grads",
    "Founding Mama rate: $49/mo locked in while you stay subscribed",
    "Q&A Library (monthly audio + weekly notes) as it rolls out",
  ];

  const showOptIn = subscription?.canSubscribe
    && (subscription.status === "available" || subscription.status === "required");

  return (
    <Shell>
      <div style={{ marginTop: 18, marginBottom: 8 }}>
        <Link
          to={PATHS.account}
          style={{ fontSize: 13, fontWeight: 700, color: T.accent, textDecoration: "underline" }}
        >
          ← Account
        </Link>
      </div>
      <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "8px 0 6px" }}>
        Payments
      </h1>
      <p style={{ fontSize: 14.5, color: T.inkSoft, margin: "0 0 18px", lineHeight: 1.5 }}>
        Your 8-week program purchase and monthly membership.
      </p>

      {searchParams.get("membership") === "success" && (
        <Card style={{ marginBottom: 14, background: T.accentSoft, border: "none" }}>
          <div style={{ fontSize: 14.5, color: T.accentDeep, lineHeight: 1.5 }}>
            Membership checkout complete. If status hasn’t updated yet, refresh in a moment —
            Stripe webhooks usually land within a few seconds.
          </div>
        </Card>
      )}

      {err && (
        <Card style={{ marginBottom: 14, background: T.accentSoft, border: "none" }}>
          <div style={{ fontSize: 14, color: T.accentDeep }}>{err}</div>
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.inkSoft }}>
          Current plan
        </div>
        <div style={{ fontFamily: FD, fontSize: 22, marginTop: 6 }}>
          {program?.label || "8-week program"}
        </div>
        <div style={{ fontSize: 14.5, color: T.inkSoft, marginTop: 4 }}>
          {phaseLabel}
          {program?.cohortName ? ` · ${program.cohortName}` : ""}
          {programRange}
        </div>
        {program?.amount != null && (
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>
            {money(program.amount, program.currency)}
            {program.receiptUrl && (
              <>
                {" · "}
                <a href={program.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.accent }}>
                  Receipt
                </a>
              </>
            )}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.inkSoft }}>
          Monthly membership
        </div>
        <div style={{ fontFamily: FD, fontSize: 22, marginTop: 6 }}>
          {subscription?.priceLabel || "Founding Mama membership"}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
          {subscription?.amount != null ? `${money(subscription.amount, subscription.currency)}/mo` : "$49/mo"}
        </div>
        <p style={{ fontSize: 14.5, color: T.inkSoft, lineHeight: 1.55, margin: "10px 0 0" }}>
          {subscription?.note}
        </p>
        {subscription?.periodLabel && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background: T.bg,
              border: `1px solid ${T.border}`,
              fontSize: 13.5,
              color: T.ink,
              lineHeight: 1.45,
              fontWeight: 600,
            }}
          >
            {subscription.periodLabel}
          </div>
        )}
        {(subscription?.status === "trialing" || subscription?.status === "active") && (
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 10, lineHeight: 1.45 }}>
            {subscription.status === "trialing" && subscription.trialEndsAt
              ? `Trial / free month ends ${when(subscription.trialEndsAt)}.`
              : null}
            {subscription.status === "active" && subscription.renewsAt
              ? `Renews ${when(subscription.renewsAt)}.`
              : null}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
            What monthly membership includes
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: T.inkSoft, lineHeight: 1.55 }}>
            {benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
        {showOptIn && (
          <>
            <Btn
              style={{ width: "100%", marginTop: 16 }}
              disabled={subBusy || !subscription?.priceConfigured}
              onClick={subscribe}
            >
              {subBusy
                ? "Starting checkout…"
                : subscription.status === "required"
                  ? "Subscribe to continue — $49/mo"
                  : "Start free month — then $49/mo"}
            </Btn>
            {!subscription?.priceConfigured && (
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8 }}>
                Membership checkout isn’t configured on this environment yet.
              </div>
            )}
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.45 }}>
              You’ll confirm in Stripe. Nothing charges until you opt in — and for Founding Members,
              the first charge waits until your free month ends.
            </div>
          </>
        )}
        {subNote && (
          <div style={{ fontSize: 13.5, color: T.amber, marginTop: 10, lineHeight: 1.45 }}>{subNote}</div>
        )}
      </Card>

      {credits && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.inkSoft }}>
            Credits
          </div>
          <div style={{ fontFamily: FD, fontSize: 28, marginTop: 6 }}>
            {moneyCents(credits.availableCents)}
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 2 }}>
            available
            {credits.pendingCents > 0 ? ` · ${moneyCents(credits.pendingCents)} pending` : ""}
          </div>
          <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, margin: "10px 0 0" }}>
            {credits.copy || "Credits apply automatically to your membership or a Lab Review."}
          </p>
          {(credits.lineItems || []).length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 0 }}>
              {credits.lineItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "10px 0",
                    borderTop: `1px solid ${T.border}`,
                    fontSize: 14,
                    lineHeight: 1.45,
                    color: T.ink,
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 22, margin: 0 }}>Payment history</h2>
        </div>
        {payments.length === 0 ? (
          <div style={{ fontSize: 14.5, color: T.inkSoft }}>No payments on file yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {payments.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "12px 0",
                  borderTop: `1px solid ${T.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.description || "Payment"}</div>
                  <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                    {when(p.created)}
                    {p.brand && p.last4 ? ` · ${p.brand} ···· ${p.last4}` : ""}
                    {p.status && p.status !== "succeeded" ? ` · ${p.status}` : ""}
                  </div>
                  {p.receiptUrl && (
                    <a
                      href={p.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, fontWeight: 700, color: T.accent, display: "inline-block", marginTop: 4 }}
                    >
                      View receipt
                    </a>
                  )}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>
                  {money(p.amount, p.currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {canOpenBillingPortal(data) ? (
        <Card style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 20, margin: "0 0 8px" }}>
            Manage card
          </h2>
          <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 12px" }}>
            Update your card and view invoices in Stripe’s secure portal. Cancellation stays in-app.
          </p>
          <Btn
            style={{ width: "100%" }}
            disabled={portalBusy}
            onClick={openPortal}
          >
            {portalBusy ? "Opening…" : "Open billing portal"}
          </Btn>
          {portalNote && (
            <div style={{ fontSize: 13.5, color: T.amber, marginTop: 10, lineHeight: 1.45 }}>{portalNote}</div>
          )}
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 10, fontFamily: F }}>
            Questions about a charge? Message Callie or use Report a problem from Account.
          </div>
        </Card>
      ) : (
        <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 28px", fontFamily: F, lineHeight: 1.45 }}>
          Questions about a charge? Message Callie or use Report a problem from Account.
        </p>
      )}
    </Shell>
  );
}
