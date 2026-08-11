function config(env) {
  return {
    base: String(env.SUPABASE_URL || "").replace(/\/$/, ""),
    key: String(env.SUPABASE_SERVICE_ROLE_KEY || ""),
  };
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    ...extra,
  };
}

export async function claimNotificationJob(env, messageType, messageId) {
  const { base, key } = config(env);
  if (!base || !key) throw new Error("missing outbox configuration");
  const resp = await fetch(`${base}/rest/v1/rpc/claim_message_notification_job`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      p_message_type: messageType,
      p_message_id: messageId,
    }),
  });
  if (!resp.ok) {
    throw new Error(`outbox claim failed (${resp.status})`);
  }
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

export async function finishNotificationJob(env, job, { success, error = "" }) {
  if (!job?.id || !job?.claim_token) throw new Error("missing outbox claim token");
  const { base, key } = config(env);
  if (!base || !key) throw new Error("missing outbox configuration");
  const resp = await fetch(`${base}/rest/v1/rpc/finish_message_notification_job`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      p_job_id: job.id,
      p_claim_token: job.claim_token,
      p_success: success === true,
      p_error: String(error || "").slice(0, 500) || null,
    }),
  });
  if (!resp.ok) throw new Error(`outbox finish failed (${resp.status})`);
  const rows = await resp.json().catch(() => []);
  if (!rows.length) throw new Error("outbox claim expired before completion");
  return rows[0];
}

export async function listDueNotificationJobs(env, limit = 20) {
  const { base, key } = config(env);
  if (!base || !key) throw new Error("missing outbox configuration");
  const now = encodeURIComponent(new Date().toISOString());
  const stale = encodeURIComponent(new Date(Date.now() - 5 * 60 * 1000).toISOString());
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const basePath = "/rest/v1/message_notification_outbox"
    + "?select=id,message_type,message_id,status,attempts,available_at,locked_at"
    + "&order=created_at.asc";
  const [dueResp, staleResp] = await Promise.all([
    fetch(
      `${base}${basePath}&status=in.(pending,retry)&available_at=lte.${now}&limit=${safeLimit}`,
      { headers: headers(key) },
    ),
    fetch(
      `${base}${basePath}&status=eq.processing&locked_at=lt.${stale}&limit=${safeLimit}`,
      { headers: headers(key) },
    ),
  ]);
  if (!dueResp.ok || !staleResp.ok) {
    throw new Error(`outbox list failed (${dueResp.status}/${staleResp.status})`);
  }
  const due = (await dueResp.json().catch(() => [])) || [];
  const staleJobs = (await staleResp.json().catch(() => [])) || [];
  return [...due, ...staleJobs]
    .sort((a, b) => String(a.available_at).localeCompare(String(b.available_at)))
    .slice(0, safeLimit);
}

export function authorizeCron(request, env) {
  const secret = String(env.CRON_SECRET || "");
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.length !== secret.length) return false;
  let result = 0;
  for (let i = 0; i < token.length; i += 1) {
    result |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return result === 0;
}

