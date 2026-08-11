/* ==================================================================
   /functions/api/admin-broadcast.js
   Admin-only: post a Callie announcement into each mama's Messages
   thread and push (email fallback when no push subscription).
   Body: { body, audience?: "active" | "all_mamas" }

   Designed for ~40+ recipients on Cloudflare Pages:
   - bulk insert messages (one REST call)
   - skip mamas who already got the same body in the last 24h (safe retry)
   - notify best-effort; never fail the whole send after inserts succeed
   ================================================================== */

import { onRequestPost as notifyDm } from "./message-notify.js";

export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(env, user.id))) return json({ error: "forbidden" }, 403);

    const payload = await request.json().catch(() => ({}));
    const text = String(payload.body || "").trim().slice(0, 2000);
    const audience = String(payload.audience || "active").toLowerCase() === "all_mamas"
      ? "all_mamas"
      : "active";
    if (text.length < 1) return json({ error: "body required" }, 400);

    const allRecipients = await listMamaIds(env, audience);
    if (!allRecipients.length) {
      return json({ ok: true, recipients: 0, messages: 0, skipped: 0, pushSent: 0, emailSent: 0 });
    }

    // Safe retry after a partial/timed-out send — don't double-post the same text.
    const already = await clientsWithRecentAnnouncement(env, text, allRecipients);
    const recipients = allRecipients.filter((id) => !already.has(id));
    const skipped = allRecipients.length - recipients.length;

    if (!recipients.length) {
      return json({
        ok: true,
        audience,
        recipients: allRecipients.length,
        messages: 0,
        skipped,
        pushSent: 0,
        emailSent: 0,
        note: "Every mama in this audience already got this exact announcement recently.",
      });
    }

    const inserted = await insertAnnouncementsBulk(env, {
      clientIds: recipients,
      senderId: user.id,
      body: text,
    });
    if (!inserted.length) {
      return json({ error: "Couldn’t save announcement messages — try again." }, 500);
    }

    const notifyPromise = notifyAnnouncementJobs(request, env, inserted);

    // Prefer finishing notifies after the response so the admin UI isn't blocked /
    // timed out by 40+ push+email subrequests.
    if (typeof waitUntil === "function") {
      waitUntil(notifyPromise.catch((e) => console.error("broadcast notify failed", e)));
      return json({
        ok: true,
        audience,
        recipients: allRecipients.length,
        messages: inserted.length,
        skipped,
        pushSent: null,
        emailSent: null,
        notifying: true,
      });
    }

    const { pushSent, emailSent } = await notifyPromise;
    return json({
      ok: true,
      audience,
      recipients: allRecipients.length,
      messages: inserted.length,
      skipped,
      pushSent,
      emailSent,
    });
  } catch (e) {
    console.error("admin-broadcast failed", e);
    return json({
      error: "broadcast failed",
      detail: String(e?.message || e).slice(0, 240),
    }, 500);
  }
}

async function notifyAnnouncementJobs(request, env, rows) {
  const queue = [...rows];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    let pushSent = 0;
    let emailSent = 0;
    while (queue.length) {
      const row = queue.shift();
      if (!row?.id || !row.client_id) continue;
      const response = await notifyDm({
        request: new Request(request.url, {
          method: "POST",
          headers: {
            authorization: request.headers.get("authorization") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({ messageId: row.id }),
        }),
        env,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`announcement notify failed (${response.status})`);
      }
      pushSent += Number(result.pushSent) || 0;
      if (result.emailSent) emailSent += 1;
    }
    return { pushSent, emailSent };
  });
  const parts = await Promise.all(workers);
  return parts.reduce(
    (acc, p) => ({ pushSent: acc.pushSent + p.pushSent, emailSent: acc.emailSent + p.emailSent }),
    { pushSent: 0, emailSent: 0 },
  );
}

async function listMamaIds(env, audience) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?select=id,role,status,refunded&role=neq.admin`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) {
    console.error("listMamaIds failed", resp.status, await resp.text().catch(() => ""));
    return [];
  }
  const rows = await resp.json().catch(() => []);
  return (rows || [])
    .filter((r) => {
      if (String(r.role || "").toLowerCase() === "admin") return false;
      if (r.refunded) return false;
      if (audience === "active") return String(r.status || "") === "active";
      return true;
    })
    .map((r) => r.id)
    .filter(Boolean);
}

/** Clients who already received this exact announcement body in the last day. */
async function clientsWithRecentAnnouncement(env, body, clientIds) {
  const out = new Set();
  if (!clientIds.length) return out;
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // Chunk `in` filters — PostgREST URL length limits.
  for (let i = 0; i < clientIds.length; i += 40) {
    const chunk = clientIds.slice(i, i + 40);
    const inList = `(${chunk.join(",")})`;
    const url =
      `${base}/rest/v1/messages`
      + `?select=client_id`
      + `&kind=eq.announcement`
      + `&body=eq.${encodeURIComponent(body)}`
      + `&created_at=gte.${encodeURIComponent(since)}`
      + `&client_id=in.${inList}`;
    try {
      const resp = await fetch(url, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
      });
      if (!resp.ok) {
        console.warn("recent announcement lookup failed", resp.status);
        continue;
      }
      const rows = await resp.json().catch(() => []);
      for (const r of rows || []) {
        if (r.client_id) out.add(r.client_id);
      }
    } catch (e) {
      console.warn("recent announcement lookup error", e);
    }
  }
  return out;
}

async function insertAnnouncementsBulk(env, { clientIds, senderId, body }) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const rows = clientIds.map((clientId) => ({
    client_id: clientId,
    sender_id: senderId,
    body,
    kind: "announcement",
  }));
  const inserted = [];
  // Chunk inserts so a single payload stays small.
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const resp = await fetch(`${base}/rest/v1/messages`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify(chunk),
    });
    if (!resp.ok) {
      console.error("bulk insert announcement failed", resp.status, await resp.text().catch(() => ""));
      continue;
    }
    const data = await resp.json().catch(() => []);
    if (Array.isArray(data)) inserted.push(...data);
  }
  return inserted;
}

async function isAdmin(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return false;
  const rows = await resp.json().catch(() => []);
  return rows[0]?.role === "admin";
}

async function requireUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  if (!base) return null;
  const resp = await fetch(`${base}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: anon },
  });
  if (!resp.ok) return null;
  return resp.json();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
