/**
 * email_events helpers for quiz leads (profile_id may be null).
 * Service-role writes; admin-only read via RLS.
 */

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function restConfig(env) {
  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) return null;
  return { base, key };
}

export async function logEmailEvent(env, {
  profileId,
  emailType,
  toEmail,
  subject,
  resendId = null,
  status = "sent",
  meta = {},
}) {
  const rest = restConfig(env);
  if (!rest || !emailType) return;

  try {
    const resp = await fetch(`${rest.base}/rest/v1/email_events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: rest.key,
        authorization: `Bearer ${rest.key}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        profile_id: profileId || null,
        email_type: emailType,
        to_email: toEmail ? normalizeEmail(toEmail) : null,
        subject: subject || null,
        resend_id: resendId || null,
        status,
        meta,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error("email_events insert failed", resp.status, detail);
    }
  } catch (e) {
    console.error("email_events insert error", e);
  }
}

/** True if this address already has a logged email of this type (idempotency). */
export async function hasEmailEventByEmail(env, email, emailType, { sentOnly = false } = {}) {
  const rest = restConfig(env);
  const normalized = normalizeEmail(email);
  if (!rest || !normalized || !emailType) return false;
  try {
    let url =
      `${rest.base}/rest/v1/email_events`
      + `?to_email=eq.${encodeURIComponent(normalized)}`
      + `&email_type=eq.${encodeURIComponent(emailType)}`
      + `&select=id&limit=1`;
    if (sentOnly) url += `&status=eq.sent`;
    const resp = await fetch(url, {
      headers: { apikey: rest.key, authorization: `Bearer ${rest.key}` },
    });
    if (!resp.ok) return false;
    const rows = await resp.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    console.warn("hasEmailEventByEmail failed", e);
    return false;
  }
}
