import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { FD, F, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { PATHS } from "../routing";
import { useAuth } from "../auth/useAuth.jsx";
import { fetchBillingSummary, openBillingPortal } from "../lib/billing";

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

function when(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Payments shell — past Stripe charges + upcoming membership placeholder.
 * Monthly post-program billing is not live yet; cancel/opt-out is stubbed.
 */
export function PaymentsPage() {
  const { user, profile, loading: authLoading, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalNote, setPortalNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authLoading || !user) {
        if (!authLoading) setLoading(false);
        return;
      }
      try {
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
  }, [user, authLoading]);

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

  const phaseLabel = program?.phase === "program_complete"
    ? "8-week program complete"
    : program?.phase === "in_program"
      ? `Week ${program.week || 1} of 8`
      : "Program";

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
        Your 8-week program purchase — and monthly membership when it launches.
      </p>

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
          {program?.paidAt ? ` · started ${when(program.paidAt)}` : ""}
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
          After your 8 weeks
        </div>
        <div style={{ fontFamily: FD, fontSize: 22, marginTop: 6 }}>
          Monthly membership
        </div>
        <p style={{ fontSize: 14.5, color: T.inkSoft, lineHeight: 1.55, margin: "8px 0 0" }}>
          {subscription?.note
            || "As an 8-week member, you’ll get access to a discounted monthly membership to keep using the app. Coming soon — nothing charges automatically."}
        </p>
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 12,
            background: T.bg,
            border: `1px solid ${T.border}`,
            fontSize: 13.5,
            color: T.inkSoft,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, color: T.ink, marginBottom: 4 }}>Coming soon</div>
          You’ll opt in here when it launches. No charge until you do.
        </div>
      </Card>

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

      <Card style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 20, margin: "0 0 8px" }}>
          Manage card
        </h2>
        <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, margin: "0 0 12px" }}>
          Update your card in Stripe’s secure portal when it’s enabled for this account.
        </p>
        <Btn
          style={{ width: "100%" }}
          disabled={portalBusy || !data?.portalAvailable}
          onClick={openPortal}
        >
          {portalBusy ? "Opening…" : "Open billing portal"}
        </Btn>
        {!data?.portalAvailable && (
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8 }}>
            Portal unlocks once Stripe Customer Portal is configured for Macros and Mamas.
          </div>
        )}
        {portalNote && (
          <div style={{ fontSize: 13.5, color: T.amber, marginTop: 10, lineHeight: 1.45 }}>{portalNote}</div>
        )}
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 10, fontFamily: F }}>
          Questions about a charge? Message Callie or use Report a problem from Account.
        </div>
      </Card>
    </Shell>
  );
}
