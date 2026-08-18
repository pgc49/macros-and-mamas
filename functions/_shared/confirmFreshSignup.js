/** Only confirm accounts created in this window so older logins stay gated. */
export const FRESH_SIGNUP_MS = 24 * 60 * 60 * 1000;
export const ADMIN_USERS_PER_PAGE = 50;
export const ADMIN_USERS_MAX_PAGES = 20;

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

export function adminUsersListUrl(base, { page, perPage = ADMIN_USERS_PER_PAGE, email } = {}) {
  const url = new URL(`${String(base || "").replace(/\/$/, "")}/auth/v1/admin/users`);
  url.searchParams.set("page", String(page || 1));
  url.searchParams.set("per_page", String(perPage));
  if (email) url.searchParams.set("email", String(email).trim().toLowerCase());
  return url.toString();
}

/**
 * Find an auth user by email. GoTrue's email query is ignored on some versions,
 * so page through admin users until the address is found.
 */
export async function findAdminUserByEmail({
  fetchImpl = fetch,
  base,
  key,
  email,
  perPage = ADMIN_USERS_PER_PAGE,
  maxPages = ADMIN_USERS_MAX_PAGES,
}) {
  const wanted = String(email || "").trim().toLowerCase();
  if (!wanted || !base || !key) return null;
  for (let page = 1; page <= maxPages; page++) {
    const resp = await fetchImpl(adminUsersListUrl(base, { page, perPage, email: wanted }), {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      const err = new Error(`admin users list ${resp.status}`);
      err.status = resp.status;
      err.detail = detail;
      throw err;
    }
    const payload = await resp.json().catch(() => ({}));
    const hit = userFromAdminList(payload, wanted);
    if (hit) return hit;
    const users = Array.isArray(payload?.users) ? payload.users : [];
    if (users.length < perPage) break;
  }
  return null;
}
