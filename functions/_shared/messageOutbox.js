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
  const freshLimit = Math.max(1, Math.ceil(safeLimit * 0.75));
  const staleLimit = Math.max(0, safeLimit - freshLimit);
  const basePath = "/rest/v1/message_notification_outbox"
    + "?select=id,message_type,message_id,status,attempts,available_at,locked_at"
    + "&order=created_at.asc";
  const [dueResp, staleResp] = await Promise.all([
    fetch(
      `${base}${basePath}&status=in.(pending,retry)&available_at=lte.${now}&limit=${freshLimit}`,
      { headers: headers(key) },
    ),
    fetch(
      `${base}${basePath}&status=eq.processing&locked_at=lt.${stale}&limit=${Math.max(1, staleLimit)}`,
      { headers: headers(key) },
    ),
  ]);
  if (!dueResp.ok || !staleResp.ok) {
    throw new Error(`outbox list failed (${dueResp.status}/${staleResp.status})`);
  }
  const due = (await dueResp.json().catch(() => [])) || [];
  const staleJobs = (await staleResp.json().catch(() => [])) || [];
  // Reserve most of every batch for fresh work so repeatedly stale jobs
  // cannot monopolize recovery.
  return [
    ...due.slice(0, freshLimit),
    ...staleJobs.slice(0, staleLimit),
  ];
}

export const NOTIFICATION_JOB_TIMEOUT_MS = 8_000;
export const NOTIFICATION_JOB_TIMEOUT_ERROR = "timeout";

/** Per-job abort so a drain can finish() the claim instead of abandoning it. */
export function createJobDeadline(ms = NOTIFICATION_JOB_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      /* already aborted */
    }
  }, Math.max(1, Number(ms) || NOTIFICATION_JOB_TIMEOUT_MS));
  if (typeof timer.unref === "function") timer.unref();
  return {
    signal: controller.signal,
    cancel() {
      clearTimeout(timer);
    },
  };
}

/** Wait for work, or throw `timeout` if `signal` aborts first. Work is not cancelled. */
export async function raceDeadline(signal, work) {
  const promise = typeof work === "function" ? work() : work;
  if (!signal) return promise;
  if (signal.aborted) throw new Error(NOTIFICATION_JOB_TIMEOUT_ERROR);
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new Error(NOTIFICATION_JOB_TIMEOUT_ERROR));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/** Register background work when waitUntil is bound; otherwise false so the caller can await. */
export function enqueueBackground(waitUntil, work) {
  if (typeof waitUntil !== "function") return false;
  try {
    waitUntil(Promise.resolve().then(work).catch((error) => {
      console.error("background notification work failed", error);
    }));
    return true;
  } catch (error) {
    console.warn("waitUntil rejected; running inline", error);
    return false;
  }
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

