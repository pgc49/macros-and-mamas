import { Navigate, useLocation } from "react-router-dom";
import { canonicalPath } from "../lib/appPaths";

/** Planted SPA folders 302 to /signin/ and /join/; the router paths have no slash. */
export function CanonicalizeTrailingSlash() {
  const location = useLocation();
  const next = canonicalPath(location.pathname);
  if (next === location.pathname) return null;
  return (
    <Navigate
      to={{ pathname: next, search: location.search, hash: location.hash }}
      replace
      state={location.state}
    />
  );
}
