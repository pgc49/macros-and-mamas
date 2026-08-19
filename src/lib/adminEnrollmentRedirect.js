import { isAdminSignupLockedSurface } from "../auth/adminSignupLock";
import {
  DEFAULT_CUSTOMER_ORIGIN,
  customerEnrollmentUrl,
  isCustomerEnrollmentPath,
} from "../../functions/_shared/customerOrigin.js";

/**
 * Client-side counterpart to the Pages Function 302.
 * SPA <Navigate> to /join or /signin?from=quiz never hits middleware.
 */
export function adminEnrollmentRedirectHref({
  pathname,
  search = "",
  hash = "",
  hostname,
  surface,
  adminAppUrl,
  customerOrigin = DEFAULT_CUSTOMER_ORIGIN,
} = {}) {
  if (!isCustomerEnrollmentPath(pathname, search)) return null;
  if (!isAdminSignupLockedSurface({ surface, hostname, adminAppUrl })) return null;
  return customerEnrollmentUrl(pathname, search, hash, customerOrigin);
}
