/* ==================================================================
   Cohort / alumni channel helpers (stage 3)
   ================================================================== */

import { cohortForDate, openEnrollmentCohort } from "./cohorts.js";

function supabaseConfig(env) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { base, key };
}

async function sbFetch(env, path, init = {}) {
  const { base, key } = supabaseConfig(env);
  if (!base || !key) throw new Error("missing supabase config");
  const resp = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: init.prefer || "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!resp.ok) {
    const err = new Error(`supabase ${resp.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function getCohortConversation(env, cohortLabel) {
  const rows = await sbFetch(
    env,
    `/rest/v1/conversations?type=eq.cohort&cohort_label=eq.${encodeURIComponent(cohortLabel)}&select=*&limit=1`,
    { method: "GET" },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function getAlumniConversation(env) {
  const rows = await sbFetch(
    env,
    `/rest/v1/conversations?type=eq.alumni&select=*&limit=1`,
    { method: "GET" },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

/** Ensure membership; re-activates if previously removed. */
export async function ensureChannelMembership(env, {
  conversationId,
  userId,
  notifyLevel = "highlights",
}) {
  if (!conversationId || !userId) throw new Error("membership requires conversation and user");
  const existing = await sbFetch(
    env,
    `/rest/v1/conversation_members?conversation_id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
    { method: "GET" },
  );
  const row = Array.isArray(existing) ? existing[0] : null;
  if (row && !row.removed_at) return row;
  if (row && row.removed_at) {
    const patched = await sbFetch(
      env,
      `/rest/v1/conversation_members?conversation_id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          removed_at: null,
          joined_at: new Date().toISOString(),
          notify_level: notifyLevel,
        }),
      },
    );
    return Array.isArray(patched) ? patched[0] : patched;
  }
  const inserted = await sbFetch(env, "/rest/v1/conversation_members", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      user_id: userId,
      notify_level: notifyLevel,
    }),
  });
  return Array.isArray(inserted) ? inserted[0] : inserted;
}

/**
 * Pay-time / approve-time stamp: keep an existing label, else use paid_at.
 * Never force-open the current enrollment cohort — a late-activated Founding
 * mama must stay on her payment window.
 * @param {{ cohort_label?: string|null, paid_at?: string|Date|null }} profile
 * @param {string|Date} [now]
 */
export function cohortAssignOptsForPaidProfile(profile, now = new Date()) {
  const existing = String(profile?.cohort_label || "").trim();
  if (existing) return { existingLabel: existing };
  return { at: profile?.paid_at || now };
}

/**
 * Stamp cohort_label + tier and join the cohort channel.
 * @param {{ at?: string|Date, forceLabel?: string }} [opts]
 */
export async function assignCohortAndJoinChannel(env, userId, opts = {}) {
  const cohort = opts.forceLabel
    ? { label: opts.forceLabel }
    : cohortForDate(opts.at || new Date());
  const label = cohort.label || openEnrollmentCohort(env).label;

  await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        cohort_label: label,
        tier: "active_pod",
      }),
      prefer: "return=minimal",
    },
  );

  const conv = await getCohortConversation(env, label);
  if (!conv) {
    console.error("assignCohortAndJoinChannel: missing conversation for", label);
    return { label, conversationId: null, membership: null };
  }
  const membership = await ensureChannelMembership(env, {
    conversationId: conv.id,
    userId,
    notifyLevel: "highlights",
  });
  return { label, conversationId: conv.id, membership };
}

/** Paid checkout — stamp from paid_at window if unlabeled. */
export async function handlePaidEnrollmentChannel(env, userId) {
  const rows = await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,cohort_label,paid_at&limit=1`,
    { method: "GET" },
  );
  const profile = Array.isArray(rows) ? rows[0] : null;
  const opts = cohortAssignOptsForPaidProfile(profile);
  if (opts.existingLabel) {
    const conv = await getCohortConversation(env, opts.existingLabel);
    if (conv) {
      await ensureChannelMembership(env, {
        conversationId: conv.id,
        userId,
        notifyLevel: "highlights",
      });
    }
    return { label: opts.existingLabel, existed: true };
  }
  return assignCohortAndJoinChannel(env, userId, { at: opts.at });
}

/** Callie activation — stamp from calendar if not already labeled. */
export async function handleActivationCohort(env, userId) {
  const rows = await sbFetch(
    env,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,cohort_label,tier,paid,paid_at&limit=1`,
    { method: "GET" },
  );
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile?.paid) return { skipped: "not_paid" };
  if (profile.cohort_label) {
    const conv = await getCohortConversation(env, profile.cohort_label);
    if (conv) {
      await ensureChannelMembership(env, {
        conversationId: conv.id,
        userId,
        notifyLevel: "highlights",
      });
    }
    if (profile.tier === "none") {
      await sbFetch(
        env,
        `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ tier: "active_pod" }),
          prefer: "return=minimal",
        },
      );
    }
    return { label: profile.cohort_label, existed: true };
  }
  // Prefer paid_at window so late activation still lands in the payment cohort.
  return assignCohortAndJoinChannel(env, userId, {
    at: profile.paid_at || new Date(),
  });
}
