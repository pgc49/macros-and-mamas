/* ==================================================================
   Service-role writes for coach_messages.

   A mama session may insert her own mama-role rows. Coach replies are
   written here with the service role from /api/coach so Callie can
   trust the role column.
   ================================================================== */

const COACH_KINDS = new Set(["text", "cards", "deflect", "photo", "read"]);

export function sanitizeCoachReply({ body = "", kind = "text", payload = null, localDate = null } = {}) {
  const nextKind = COACH_KINDS.has(kind) ? kind : "text";
  let nextPayload = null;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    nextPayload = {
      cards: Array.isArray(payload.cards) ? payload.cards.slice(0, 6) : [],
      deflect: payload.deflect ? String(payload.deflect).slice(0, 40) : null,
      aside: payload.aside ? String(payload.aside).slice(0, 40) : null,
    };
    if (!nextPayload.cards.length && !nextPayload.deflect && !nextPayload.aside) {
      nextPayload = null;
    }
  }
  const day = String(localDate || "").trim();
  return {
    role: "coach",
    body: String(body || "").slice(0, 4000),
    kind: nextKind,
    payload: nextPayload,
    local_date: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
  };
}

export async function insertCoachReply(env, userId, message) {
  if (!userId) return { ok: false, skipped: true };
  const row = sanitizeCoachReply(message);
  const base = (env?.SUPABASE_URL || env?.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error("coach reply persist missing service role");
    return { ok: false };
  }

  const write = await fetch(`${base}/rest/v1/coach_messages`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      profile_id: userId,
      ...row,
    }),
  });
  if (!write.ok) {
    console.error("coach reply persist failed", write.status);
    return { ok: false };
  }
  return { ok: true };
}
