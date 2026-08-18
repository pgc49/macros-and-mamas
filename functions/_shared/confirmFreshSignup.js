/** Only confirm accounts created in this window so older logins stay gated. */
export const FRESH_SIGNUP_MS = 24 * 60 * 60 * 1000;

export function shouldConfirmFreshUser(user, now = Date.now()) {
  if (!user?.id) return false;
  if (user.email_confirmed_at) return false;
  const created = Date.parse(user.created_at || "");
  if (!Number.isFinite(created)) return false;
  return now - created <= FRESH_SIGNUP_MS;
}

export function userFromAdminList(payload, email) {
  const wanted = String(email || "").trim().toLowerCase();
  const users = Array.isArray(payload?.users) ? payload.users : [];
  return users.find((u) => String(u?.email || "").trim().toLowerCase() === wanted) || null;
}
