import { Link, Navigate } from "react-router-dom";
import { FD, T } from "../theme/tokens";
import { Shell, Card } from "../components/ui";
import { PATHS } from "../routing";
import { useAuth } from "../auth/useAuth.jsx";
import { needsMembershipPaywall } from "../lib/membershipAccess";
import { MembershipPayPrompt } from "../components/MembershipPayPrompt";

/**
 * Direct checkout link (/membership).
 * Opening the app lands on Today, which shows the same pay card.
 */
export function MembershipGatePage() {
  const { user, profile, loading, isAdmin, signOut } = useAuth();

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

  return (
    <Shell>
      <div style={{ marginTop: 18 }}>
        <MembershipPayPrompt profile={profile} sticky={false} />
        <Link
          to={PATHS.dashboard}
          style={{
            display: "block",
            textAlign: "center",
            fontSize: 14,
            fontWeight: 700,
            color: T.accent,
            marginBottom: 8,
          }}
        >
          See your ranges
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
      </div>
    </Shell>
  );
}
