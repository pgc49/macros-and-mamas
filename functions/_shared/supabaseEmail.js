/**
 * Invoke Supabase Edge Functions that send Resend emails.
 * Uses SUPABASE_SERVICE_ROLE_KEY (already on Cloudflare for the Stripe webhook).
 */

export async function invokeEdgeFunction(env, slug, payload) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error("invokeEdgeFunction missing SUPABASE_URL or SERVICE_ROLE_KEY", slug);
    return { ok: false, error: "missing supabase config" };
  }

  try {
    const resp = await fetch(`${base}/functions/v1/${slug}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        apikey: key,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("edge function failed", slug, resp.status, data);
      return { ok: false, status: resp.status, data };
    }
    return { ok: true, data };
  } catch (e) {
    console.error("edge function invoke error", slug, e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Best-effort profile + auth email lookup via service role. */
export async function loadUserContact(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !userId) return { email: null, name: null, profile: null };

  const [profileResp, userResp] = await Promise.all([
    fetch(
      `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } }
    ),
    fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    }),
  ]);

  const profiles = profileResp.ok ? await profileResp.json().catch(() => []) : [];
  const profile = profiles[0] || null;
  const authUser = userResp.ok ? await userResp.json().catch(() => null) : null;

  return {
    email: authUser?.email || null,
    name: profile?.name || null,
    profile,
  };
}

export async function sendWelcomeEmails(env, { email, name, userId }) {
  if (!email) return;
  await invokeEdgeFunction(env, "welcome-email", { email, name, userId });
  await invokeEdgeFunction(env, "notify-callie", {
    type: "payment",
    email,
    name: name || email,
  });
}

export async function sendIntakeEmails(env, { email, name, stats }) {
  if (email) {
    await invokeEdgeFunction(env, "intake-received", { email, name });
  }
  await invokeEdgeFunction(env, "notify-callie", {
    type: "intake",
    email,
    name: name || email,
    stats,
  });
}

export async function sendApprovedEmail(env, { email, name }) {
  if (!email) return;
  await invokeEdgeFunction(env, "application-approved", { email, name });
}

export async function sendRefundEmails(env, { email, name, reason }) {
  if (email) {
    await invokeEdgeFunction(env, "eligibility-refund", { email, name, reason });
  }
  await invokeEdgeFunction(env, "notify-callie", {
    type: "refund",
    email,
    name: name || email,
    reason,
  });
}
