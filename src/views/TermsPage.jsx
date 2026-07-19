import { Link } from "react-router-dom";
import { FD, T, F } from "../theme/tokens";
import { Shell, Card } from "../components/ui";
import { PATHS } from "../routing";
import { TERMS_EFFECTIVE_DATE, TERMS_SECTIONS } from "../content/terms";

export function TermsPage() {
  return (
    <Shell>
      <div style={{ padding: "10px 0 8px" }}>
        <Link
          to={PATHS.home}
          style={{
            fontFamily: F, fontSize: 13, fontWeight: 700, color: T.accent, textDecoration: "underline",
          }}
        >
          ← Back
        </Link>
      </div>

      <Card style={{ padding: "22px 20px" }}>
        <h1 style={{ fontFamily: FD, fontWeight: 400, fontSize: 28, margin: "0 0 6px", lineHeight: 1.2 }}>
          Terms and Conditions
        </h1>
        <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 18px" }}>
          Effective date: {TERMS_EFFECTIVE_DATE}
        </p>

        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: T.ink, margin: "0 0 14px" }}>
          Welcome to Macros and Mamas. These Terms and Conditions (&quot;Terms&quot;) are a binding agreement between you and{" "}
          <b>C&C Health Coaching LLC</b>, a California limited liability company (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;),
          governing your purchase and use of the Macros and Mamas program, website (macrosandmamas.com), web application,
          community groups, and related content and services (collectively, the &quot;Program&quot;).
        </p>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: T.ink, margin: "0 0 22px" }}>
          By purchasing the Program, creating an account, or using any part of the Program, you agree to these Terms.
          If you do not agree, do not purchase or use the Program.
        </p>

        {TERMS_SECTIONS.map((section) => (
          <section key={section.title} style={{ marginBottom: 22 }}>
            <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 20, margin: "0 0 8px" }}>
              {section.title}
            </h2>
            {section.body.map((para) => (
              <p
                key={para.slice(0, 48)}
                style={{ fontSize: 14, lineHeight: 1.6, color: T.ink, margin: "0 0 10px" }}
              >
                {para}
              </p>
            ))}
          </section>
        ))}
      </Card>
    </Shell>
  );
}
