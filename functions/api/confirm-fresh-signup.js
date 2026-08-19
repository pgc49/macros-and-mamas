/* ==================================================================
   POST /api/confirm-fresh-signup
   ==================================================================
   Quiz create-account often gets a user but no session because
   "Confirm email" is on and the confirm mail never arrives. Confirm
   only unconfirmed users created in the last 24h, then the client
   signs in with the password they just typed.
   Always returns { ok: true } so the endpoint cannot enumerate emails.
   ================================================================== */

import {
  findAdminUserByEmail,
  shouldConfirmFreshUser,
} from "../_shared/confirmFreshSignup.js";
import {
  hostnameFromOriginOrHost,
  isAdminSignupLockedHost,
} from "../_shared/adminOrigin.js";

const ALLOWED_HOSTS = new Set([
  "www.macrosandmamas.com",
  "macrosandmamas.com",
  "localhost",
  "127.0.0.1",
]);

export async function onRequestPost({ request, env }) {
  try {
    if (!originAllowed(request, env)) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return json({ ok: true });
    }

    const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!base || !key) {
      console.error("confirm-fresh-signup missing supabase config");
      return json({ ok: true });
    }

    let user;
    try {
      user = await findAdminUserByEmail({
        fetchImpl: fetch,
        base,
        key,
        email,
      });
    } catch (listErr) {
      console.error("confirm-fresh-signup list failed", listErr.status, listErr.detail || listErr);
      return json({ ok: true });
    }
    if (!shouldConfirmFreshUser(user)) {
      return json({ ok: true });
    }

    const confirmResp = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PUT",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email_confirm: true }),
    });
    if (!confirmResp.ok) {
      console.error("confirm-fresh-signup update failed", confirmResp.status, await confirmResp.text());
    }
    return json({ ok: true });
  } catch (e) {
    console.error("confirm-fresh-signup failed", e);
    return json({ ok: true });
  }
}

export function originAllowed(request, env) {
  const requestHost = hostnameFromOriginOrHost(request.url);
  const originHost = hostnameFromOriginOrHost(request.headers.get("origin") || "");
  const hostHeader = hostnameFromOriginOrHost(request.headers.get("host") || "");
  if (
    isAdminSignupLockedHost(requestHost, env)
    || isAdminSignupLockedHost(originHost, env)
    || isAdminSignupLockedHost(hostHeader, env)
  ) {
    return false;
  }

  const origin = request.headers.get("origin") || "";
  if (!origin) {
    return ALLOWED_HOSTS.has(requestHost) || requestHost.endsWith(".pages.dev");
  }
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return ALLOWED_HOSTS.has(host) || host.endsWith(".pages.dev");
  } catch {
    return false;
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
