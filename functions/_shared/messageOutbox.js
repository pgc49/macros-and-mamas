const MAX_ATTEMPTS = 6;

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
  if (!job?.id) return;
  const { base, key } = config(env);
  if (!base || !key) throw new Error("missing outbox configuration");

  const attempts = Math.max(1, Number(job.attempts) || 1);
  const terminal = !success && attempts >= MAX_ATTEMPTS;
  const delaySeconds = Math.min(15 * 60, 30 * (2 ** Math.max(0, attempts - 1)));
  const next = new Date(Date.now() + delaySeconds * 1000).toISOString();
  const patch = success
    ? {
      status: "sent",
      sent_at: new Date().toISOString(),
      locked_at: null,
      last_error: null,
    }
    : {
      status: terminal ? "dead" : "retry",
      available_at: next,
      locked_at: null,
      last_error: String(error || "notification failed").slice(0, 500),
    };

  const resp = await fetch(
    `${base}/rest/v1/message_notification_outbox?id=eq.${encodeURIComponent(job.id)}`,
    {
      method: "PATCH",
      headers: headers(key, { prefer: "return=minimal" }),
      body: JSON.stringify(patch),
    },
  );
  if (!resp.ok) throw new Error(`outbox finish failed (${resp.status})`);
}

export async function listDueNotificationJobs(env, limit = 20) {
  const { base, key } = config(env);
  if (!base || !key) throw new Error("missing outbox configuration");
  const now = encodeURIComponent(new Date().toISOString());
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const path = "/rest/v1/message_notification_outbox"
    + "?select=id,message_type,message_id,status,attempts,available_at,locked_at"
    + "&status=in.(pending,retry,processing)"
    + `&available_at=lte.${now}`
    + "&order=created_at.asc"
    + `&limit=${safeLimit}`;
  const resp = await fetch(`${base}${path}`, { headers: headers(key) });
  if (!resp.ok) throw new Error(`outbox list failed (${resp.status})`);
  return (await resp.json().catch(() => [])) || [];
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

