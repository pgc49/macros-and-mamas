import { Link, Navigate } from "react-router-dom";
import { FD, T } from "../theme/tokens";
import { Shell, Card } from "../components/ui";
import { PATHS, goMarketingHome } from "../routing";
import { useAuth } from "../auth/useAuth.jsx";
import { fullName } from "../db/db";

const ROWS = [
  {
    to: PATHS.accountProfile,
    title: "Profile",
    body: "Name, photo, birthday, goals, and food preferences.",
  },
  {
    to: PATHS.accountPayments,
    title: "Payments",
    body: "Past charges and upcoming membership options.",
  },
  {
    to: PATHS.accountShare,
    title: "Share Macros and Mamas",
    body: "Your referral code, share text, and friend tally.",
  },
  {
    to: PATHS.support,
    title: "Report a problem",
    body: "Bugs, glitches, or feedback for Tech Guy.",
  },
];

/** Account hub — mobile-friendly entry to Profile + Payments. */
export function AccountPage() {
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
    return <Navigate to={PATHS.signin} replace state={{ from: PATHS.account }} />;
  }

  if (profile?.refunded) {
    return <Navigate to={PATHS.goodbye} replace />;
  }

  const display = fullName({ name: profile?.name, last_name: profile?.last_name })
    || user.email
    || "Your account";

  const signOutBtn = (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        goMarketingHome();
      }}
      style={{
        display: "block",
        width: "100%",
        marginTop: 22,
        padding: "14px 18px",
        borderRadius: 999,
        border: `1.5px solid ${T.border}`,
        background: "#fff",
        fontWeight: 700,
        fontSize: 15,
        color: T.ink,
        cursor: "pointer",
      }}
    >
      Sign out
    </button>
  );

  // Unpaid: avatar used to loop /account → /join. Offer escape + finish checkout.
  if (!profile?.paid && !isAdmin) {
    return (
      <Shell>
        <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "18px 0 4px" }}>
          Account
        </h1>
        <p style={{ fontSize: 14.5, color: T.inkSoft, margin: "0 0 18px", lineHeight: 1.5 }}>
          Signed in as <strong style={{ color: T.ink }}>{user.email}</strong>.
          {" "}Finish checkout to unlock your full account.
        </p>
        <Card style={{ padding: "16px 18px" }}>
          <Link
            to={PATHS.join}
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Finish signing up</div>
                <div style={{ fontSize: 13.5, color: T.inkSoft, marginTop: 3, lineHeight: 1.45 }}>
                  Lock in your spot, then complete intake.
                </div>
              </div>
              <span style={{ color: T.inkSoft, fontSize: 22, lineHeight: 1 }} aria-hidden>›</span>
            </div>
          </Link>
        </Card>
        <a
          href={PATHS.home}
          style={{
            display: "block",
            marginTop: 18,
            textAlign: "center",
            fontSize: 14,
            fontWeight: 700,
            color: T.accent,
            textDecoration: "underline",
          }}
        >
          Back to homepage
        </a>
        {signOutBtn}
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ marginTop: 18, marginBottom: 8 }}>
        <Link
          to={PATHS.dashboard}
          style={{ fontSize: 13, fontWeight: 700, color: T.accent, textDecoration: "underline" }}
        >
          ← Back to dashboard
        </Link>
      </div>
      <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "8px 0 4px" }}>
        Account
      </h1>
      <p style={{ fontSize: 14.5, color: T.inkSoft, margin: "0 0 18px", lineHeight: 1.5 }}>
        {display}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ROWS.map((row) => (
          <Link
            key={row.to}
            to={row.to}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Card style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{row.title}</div>
                  <div style={{ fontSize: 13.5, color: T.inkSoft, marginTop: 3, lineHeight: 1.45 }}>
                    {row.body}
                  </div>
                </div>
                <span style={{ color: T.inkSoft, fontSize: 22, lineHeight: 1 }} aria-hidden>›</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {signOutBtn}
    </Shell>
  );
}
