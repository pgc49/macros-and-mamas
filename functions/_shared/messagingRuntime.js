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
  return rows[0] || {
    mode: "normal",
    attachments_enabled: true,
    notifications_enabled: true,
    reason: "",
    updated_at: null,
    updated_by: null,
  };
}

export async function updateMessagingRuntime(env, patch, userId) {
  const { base, serviceKey } = config(env);
  if (!base || !serviceKey) throw new Error("missing messaging runtime configuration");
  const response = await fetch(
    `${base}/rest/v1/messaging_runtime_config?singleton=eq.true`,
    {
      method: "PATCH",
      headers: serviceHeaders(serviceKey, { prefer: "return=representation" }),
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }),
    },
  );
  if (!response.ok) throw new Error(`runtime update failed (${response.status})`);
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
  const [runtime, jobsResponse, dmResponse, channelResponse] = await Promise.all([
    loadMessagingRuntime(env),
    fetch(
      `${base}/rest/v1/message_notification_outbox`
        + "?select=status,attempts,created_at,available_at,locked_at"
        + "&status=neq.sent&order=created_at.asc&limit=500",
      { headers },
    ),
    fetch(`${base}/rest/v1/messages?select=created_at&order=created_at.desc&limit=1`, { headers }),
    fetch(
      `${base}/rest/v1/conversation_messages?select=created_at&order=created_at.desc&limit=1`,
      { headers },
    ),
  ]);
  if (!jobsResponse.ok || !dmResponse.ok || !channelResponse.ok) {
    throw new Error("messaging health query failed");
  }
  const jobs = await jobsResponse.json();
  const dm = await dmResponse.json();
  const channels = await channelResponse.json();
  if (!Array.isArray(jobs) || !Array.isArray(dm) || !Array.isArray(channels)) {
    throw new Error("messaging health payload invalid");
  }
  const now = Date.now();
  const counts = { pending: 0, retry: 0, processing: 0, dead: 0 };
  for (const job of jobs) {
    if (Object.hasOwn(counts, job.status)) counts[job.status] += 1;
  }
  const oldest = jobs[0]?.created_at || null;
  const oldestAgeSeconds = oldest
    ? Math.max(0, Math.round((now - new Date(oldest).getTime()) / 1000))
    : 0;
  return {
    runtime,
    outbox: {
      ...counts,
      totalOpen: jobs.length,
      oldest,
      oldestAgeSeconds,
    },
    latestMessageAt: dm[0]?.created_at || null,
    latestChannelMessageAt: channels[0]?.created_at || null,
  };
}

