import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { adminEnrollmentRedirectHref } from "../lib/adminEnrollmentRedirect";
import { Shell } from "./ui";
import { FD, T } from "../theme/tokens";

/**
 * Hard-navigates admin-host enrollment routes to www.
 * React Router <Navigate> stays on the admin origin; Stripe / quiz
 * handoff must leave this surface entirely.
 */
export function AdminEnrollmentRedirect({ children }) {
  const location = useLocation();
  const href = adminEnrollmentRedirectHref({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  });

  useEffect(() => {
    if (href) window.location.replace(href);
  }, [href]);

  if (!href) return children;

  return (
    <Shell>
      <div style={{ fontFamily: FD, fontSize: 18, color: T.inkSoft, padding: "24px 0" }}>
        Opening checkout on the customer app…
      </div>
    </Shell>
  );
}
