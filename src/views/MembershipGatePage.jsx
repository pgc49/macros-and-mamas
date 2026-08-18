import { Link, Navigate } from "react-router-dom";
import { FD, T } from "../theme/tokens";
import { Shell, Card, Btn } from "../components/ui";
import { PATHS } from "../routing";
import { useAuth } from "../auth/useAuth.jsx";
import { hasFoundingFreeMonth } from "../lib/cohorts";
import { membershipGateMessage, needsMembershipPaywall } from "../lib/membershipAccess";
import { startMembershipCheckout } from "../lib/billing";
import { useState } from "react";

/**
 * Hard gate after founding free month (or programEnd for later cohorts)
 * when there is no active membership.
 * Only Payments + sign out remain available from here.
 */
export function MembershipGatePage() {
  const { user, profile, loading, isAdmin, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (loading) {
    return (
      <Shell>
        <Card style={{ marginTop: 24 }}>
          <div style={{ fontFamily: FD, fontSize: 20, color: T.inkSoft }}>Loading…</div>
        </Card>
      </Shell>
    );
  }

  if (!user) {
    return <Navigate to={PATHS.signin} replace state={{ from: PATHS.membership }} />;
  }
  if (isAdmin || !needsMembershipPaywall(profile)) {
    return <Navigate to={PATHS.dashboard} replace />;
  }

  const subscribe = async () => {
    setErr("");
    setBusy(true);
    try {
      await startMembershipCheckout();
    } catch (e) {
      setErr(e?.message || "Couldn't start checkout.");
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Card style={{ marginTop: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.inkSoft }}>
          Membership needed
        </div>
        <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "8px 0 10px" }}>
          Keep your Macros and Mamas access
        </h1>
        <p style={{ fontSize: 15, color: T.inkSoft, lineHeight: 1.55, margin: "0 0 14px" }}>
          {membershipGateMessage(profile)}
        </p>
        <ul style={{ margin: "0 0 18px", paddingLeft: 18, color: T.ink, fontSize: 14.5, lineHeight: 1.55 }}>
          <li>Founding rate locked in while you stay subscribed</li>
          {hasFoundingFreeMonth(profile?.cohort_label) && (
            <li>No second free trial on resubscribe</li>
          )}
          <li>Cancel anytime later from Payments</li>
        </ul>
        {err && (
          <div style={{ fontSize: 14, color: T.accentDeep, marginBottom: 12 }}>{err}</div>
        )}
        <Btn style={{ width: "100%", marginBottom: 10 }} disabled={busy} onClick={subscribe}>
          {busy ? "Starting checkout…" : "Subscribe — $49/mo"}
        </Btn>
        <Link
          to={PATHS.accountPayments}
          style={{
            display: "block",
            textAlign: "center",
            fontSize: 14,
            fontWeight: 700,
            color: T.accent,
            marginBottom: 16,
          }}
        >
          View Payments details
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          style={{
            display: "block",
            width: "100%",
            background: "none",
            border: "none",
            color: T.inkSoft,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            textDecoration: "underline",
            padding: 8,
          }}
        >
          Sign out
        </button>
      </Card>
    </Shell>
  );
}
