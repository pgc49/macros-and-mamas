import { Link } from "react-router-dom";
import { T } from "../theme/tokens";
import { PATHS } from "../routing";

/** Quiet footer on Today / Meals / Progress → signed-in /support form. */
export function TechHelpFooter() {
  return (
    <div style={{ textAlign: "center", marginTop: 16, marginBottom: 4 }}>
      <Link
        to={PATHS.support}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: T.inkSoft,
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        App help & feedback
      </Link>
    </div>
  );
}
