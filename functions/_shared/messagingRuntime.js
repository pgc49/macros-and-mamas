function config(env) {
  return {
    base: String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, ""),
    serviceKey: String(env.SUPABASE_SERVICE_ROLE_KEY || ""),
    anonKey: String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ""),
  };
}

function serviceHeaders(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    ...extra,
  };
}

export async function loadMessagingRuntime(env) {
  const { base, serviceKey } = config(env);
  if (!base || !serviceKey) throw new Error("missing messaging runtime configuration");
  const response = await fetch(
    `${base}/rest/v1/messaging_runtime_config?singleton=eq.true`
      + "&select=mode,attachments_enabled,notifications_enabled,reason,updated_at,updated_by"
      + "&limit=1",
    { headers: serviceHeaders(serviceKey) },
  );
  if (!response.ok) throw new Error(`runtime load failed (${response.status})`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("runtime payload invalid");
  if (!rows[0]) throw new Error("runtime singleton missing");
  return rows[0];
}

export async function updateMessagingRuntime(
  env,
  patch,
  userId,
  expectedUpdatedAt,
  requestId,
) {
  const { base, serviceKey } = config(env);
  if (!base || !serviceKey) throw new Error("missing messaging runtime configuration");
  const response = await fetch(`${base}/rest/v1/rpc/update_messaging_runtime`, {
    method: "POST",
    headers: serviceHeaders(serviceKey),
    body: JSON.stringify({
      p_actor_id: userId,
      p_request_id: requestId,
      p_expected_updated_at: expectedUpdatedAt,
      p_mode: patch.mode ?? null,
      p_attachments_enabled: patch.attachments_enabled ?? null,
      p_notifications_enabled: patch.notifications_enabled ?? null,
      p_reason: patch.reason ?? null,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.message || `runtime update failed (${response.status})`);
    if (payload.code === "40001") error.code = "CONFLICT";
    throw error;
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]) throw new Error("runtime update returned no row");
  return rows[0];
}

export async function requireAdmin(request, env) {
  const { base, serviceKey, anonKey } = config(env);
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!base || !serviceKey || !anonKey || !token) return null;

  const userResponse = await fetch(`${base}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json().catch(() => null);
  if (!user?.id) return null;

  const profileResponse = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
    { headers: serviceHeaders(serviceKey) },
  );
  if (!profileResponse.ok) return null;
  const profiles = await profileResponse.json().catch(() => []);
  return profiles[0]?.role === "admin" ? user : null;
}

export async function loadMessagingHealth(env) {
  const { base, serviceKey } = config(env);
  if (!base || !serviceKey) throw new Error("missing messaging health configuration");
  const headers = serviceHeaders(serviceKey);
  const [runtime, healthResponse] = await Promise.all([
    loadMessagingRuntime(env),
    fetch(
      `${base}/rest/v1/rpc/messaging_health_snapshot`,
      {
        method: "POST",
        headers,
        body: "{}",
      },
    ),
  ]);
  if (!healthResponse.ok) throw new Error("messaging health query failed");
  const rows = await healthResponse.json();
  if (!Array.isArray(rows) || !rows[0]) {
    throw new Error("messaging health payload invalid");
  }
  const snapshot = rows[0];
  const now = Date.now();
  const oldest = snapshot.oldest_open_at || null;
  const oldestAgeSeconds = oldest
    ? Math.max(0, Math.round((now - new Date(oldest).getTime()) / 1000))
    : 0;
  return {
    runtime: {
      mode: runtime.mode,
      attachments_enabled: runtime.attachments_enabled,
      notifications_enabled: runtime.notifications_enabled,
    },
    outbox: {
      pending: Number(snapshot.pending) || 0,
      retry: Number(snapshot.retry) || 0,
      processing: Number(snapshot.processing) || 0,
      dead: Number(snapshot.dead) || 0,
      expired: Number(snapshot.expired) || 0,
      staleProcessing: Number(snapshot.stale_processing) || 0,
      totalOpen: (Number(snapshot.pending) || 0)
        + (Number(snapshot.retry) || 0)
        + (Number(snapshot.processing) || 0)
        + (Number(snapshot.dead) || 0),
      oldest,
      oldestAgeSeconds,
    },
  };
}

