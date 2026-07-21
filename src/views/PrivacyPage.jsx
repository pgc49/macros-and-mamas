import { Link } from "react-router-dom";
import { FD, T, F } from "../theme/tokens";
import { Shell, Card } from "../components/ui";
import { PATHS } from "../routing";
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_INTRO, PRIVACY_SECTIONS } from "../content/privacy";

export function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 18px" }}>
          Effective date: {PRIVACY_EFFECTIVE_DATE}
        </p>

        {PRIVACY_INTRO.map((para) => (
          <p
            key={para.slice(0, 40)}
            style={{ fontSize: 14.5, lineHeight: 1.6, color: T.ink, margin: "0 0 14px" }}
          >
            {para.includes("Terms and Conditions") ? (
              <>
                {para.split("Terms and Conditions")[0]}
                <Link
                  to={PATHS.terms}
                  style={{ fontFamily: F, fontWeight: 700, color: T.accent, textDecoration: "underline" }}
                >
                  Terms and Conditions
                </Link>
                {para.split("Terms and Conditions")[1]}
              </>
            ) : (
              para
            )}
          </p>
        ))}

        {PRIVACY_SECTIONS.map((section) => (
          <section key={section.title} style={{ marginBottom: 22 }}>
            <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 20, margin: "0 0 8px" }}>
              {section.title}
            </h2>
            {section.body.map((para, i) => (
              <p
                key={`${section.title}-${i}`}
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
