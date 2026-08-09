/* ==================================================================
   /functions/api/channel-prompts-cron.js
   Hourly (or weekly Action): post due channel_prompts as system messages.
   Auth: Bearer CRON_SECRET
   ================================================================== */

export async function onRequestPost({ request, env }) {
  try {
    if (!authorizeCron(request, env)) return json({ error: "unauthorized" }, 401);

    const prompts = await listActivePrompts(env);
    const posted = [];
    for (const prompt of prompts) {
      if (!isDue(prompt)) continue;
      let claim = null;
      try {
        // Claim due slot first to reduce double-post under overlapping crons.
        claim = await claimPromptDue(env, prompt);
        if (!claim) continue;
        const msg = await postSystemPrompt(env, prompt);
        if (msg?.id) {
          await notifySystemMessage(env, msg.id);
        }
        posted.push({ promptId: prompt.id, messageId: msg?.id || null });
      } catch (e) {
        console.error("prompt post failed", prompt.id, e);
        // Roll back claim so the next cron can retry.
        if (claim) {
          await releasePromptClaim(env, prompt.id, claim).catch((err) => {
            console.warn("prompt claim rollback failed", prompt.id, err);
          });
        }
      }
    }
    return json({ ok: true, checked: prompts.length, posted: posted.length, items: posted }, 200);
  } catch (e) {
    console.error("channel-prompts-cron failed", e);
    return json({ error: "cron failed" }, 500);
  }
}

function authorizeCron(request, env) {
  const secret = String(env.CRON_SECRET || "");
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.length !== secret.length) return false;
  let out = 0;
  for (let i = 0; i < token.length; i += 1) out |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return out === 0;
}

function isDue(prompt) {
  const cadence = String(prompt.cadence || "weekly").toLowerCase();
  const last = prompt.last_posted_at ? Date.parse(prompt.last_posted_at) : 0;
  const now = Date.now();
  if (!last) return true;
  const minGapMs = cadence === "daily" ? 20 * 3600 * 1000 : 6 * 24 * 3600 * 1000;
  return now - last >= minGapMs;
}

async function listActivePrompts(env) {
  const { base, key } = cfg(env);
  const resp = await fetch(
    `${base}/rest/v1/channel_prompts?active=eq.true&select=*`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) throw new Error(`prompts ${resp.status}`);
  return resp.json();
}

async function postSystemPrompt(env, prompt) {
  const { base, key } = cfg(env);
  const resp = await fetch(`${base}/rest/v1/conversation_messages`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify({
      conversation_id: prompt.conversation_id,
      sender_id: null,
      body: String(prompt.body || "").trim().slice(0, 500),
      kind: "system",
    }),
  });
  if (!resp.ok) throw new Error(`insert ${resp.status} ${await resp.text()}`);
  const rows = await resp.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * Returns { claimedAt, previousLastPostedAt } if this cron won the due claim; else null.
 */
async function claimPromptDue(env, prompt) {
  const { base, key } = cfg(env);
  const cadence = String(prompt.cadence || "weekly").toLowerCase();
  const minGapMs = cadence === "daily" ? 20 * 3600 * 1000 : 6 * 24 * 3600 * 1000;
  const cutoff = new Date(Date.now() - minGapMs).toISOString();
  const claimedAt = new Date().toISOString();
  const previousLastPostedAt = prompt.last_posted_at || null;
  const filter = previousLastPostedAt
    ? `id=eq.${encodeURIComponent(prompt.id)}&last_posted_at=lte.${encodeURIComponent(cutoff)}`
    : `id=eq.${encodeURIComponent(prompt.id)}&last_posted_at=is.null`;
  const resp = await fetch(`${base}/rest/v1/channel_prompts?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify({ last_posted_at: claimedAt }),
  });
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { claimedAt, previousLastPostedAt };
}

/** Undo a failed claim so the next run can retry. */
async function releasePromptClaim(env, promptId, claim) {
  const { base, key } = cfg(env);
  await fetch(
    `${base}/rest/v1/channel_prompts?id=eq.${encodeURIComponent(promptId)}`
      + `&last_posted_at=eq.${encodeURIComponent(claim.claimedAt)}`,
    {
      method: "PATCH",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({ last_posted_at: claim.previousLastPostedAt }),
    },
  );
}

async function notifySystemMessage(env, messageId) {
  const origin = String(env.APP_ORIGIN || "https://www.macrosandmamas.com").replace(/\/$/, "");
  const secret = String(env.CRON_SECRET || "");
  if (!secret) return;
  try {
    const resp = await fetch(`${origin}/api/channel-notify`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ messageId }),
    });
    if (!resp.ok) {
      console.warn("system notify failed", resp.status, await resp.text().catch(() => ""));
    }
  } catch (e) {
    console.warn("system notify error", e);
  }
}

function cfg(env) {
  return {
    base: (env.SUPABASE_URL || "").replace(/\/$/, ""),
    key: env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
