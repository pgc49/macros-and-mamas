/** Isolated coach origin. Customer/www never hosts /admin. */
export const DEFAULT_ADMIN_ORIGIN = "https://admin.macrosandmamas.com";

export function adminOriginFromEnv(env) {
  const raw = String(env?.VITE_ADMIN_APP_URL || env?.ADMIN_APP_URL || DEFAULT_ADMIN_ORIGIN).trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return DEFAULT_ADMIN_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_ADMIN_ORIGIN;
  }
}

export function adminPortalUrl(env) {
  return `${adminOriginFromEnv(env)}/admin`;
}
