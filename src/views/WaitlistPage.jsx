import { Link } from "react-router-dom";
import { FD, T } from "../theme/tokens";
import { Shell, Card } from "../components/ui";
import { CohortWaitlistForm } from "../components/CohortWaitlistForm";
import { PATHS } from "../routing";

/** Dedicated cohort-two waitlist signup (name, email, phone). */
export function WaitlistPage() {
  return (
    <Shell>
      <Card style={{ marginTop: 24, padding: 28 }}>
        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: T.accentDeep, letterSpacing: "0.02em" }}>
          Cohort two
        </p>
        <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "0 0 10px", lineHeight: 1.2 }}>
          Register for priority access
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 20px" }}>
          The founding group is closed. Leave your details and we&apos;ll email you first when cohort two opens.
        </p>
        <CohortWaitlistForm source="waitlist_page" />
        <p style={{ margin: "18px 0 0", fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
          <Link to={PATHS.home} style={{ color: T.accent, fontWeight: 700, textDecoration: "underline" }}>
            ← Back to home
          </Link>
          {" · "}
          <Link to={PATHS.signin} style={{ color: T.accent, fontWeight: 700, textDecoration: "underline" }}>
            Already enrolled? Sign in
          </Link>
        </p>
      </Card>
    </Shell>
  );
}
