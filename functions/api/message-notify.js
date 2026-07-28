/* ==================================================================
   /functions/api/message-notify.js
   After a message insert: web push to recipient, email if no push.
   Auth required (sender). Push goes through Edge Function send-push
   (VAPID keys live there). Optional RESEND_API_KEY for email fallback.
   ================================================================== */

import { invokeEdgeFunction, logEmailEvent, loadUserContact } from "../_shared/supabaseEmail.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    const messageId = String(body.messageId || "").trim();
    if (!messageId) return json({ error: "messageId required" }, 400);

    const msg = await loadMessage(env, messageId);
    if (!msg) return json({ error: "not found" }, 404);
    if (msg.sender_id !== user.id && !(await isAdmin(env, user.id))) {
      return json({ error: "forbidden" }, 403);
    }

    const fromMama = msg.sender_id === msg.client_id;
    const preview = String(msg.body || "").replace(/\s+/g, " ").trim().slice(0, 140);

    let pushSent = 0;
    let emailSent = false;

    if (fromMama) {
      const adminIds = await listAdminIds(env);
      for (const adminId of adminIds) {
        pushSent += await sendPushToProfile(env, adminId, {
          title: "New message from a mama",
          body: preview || "Open Messages in admin",
          url: "/admin?tab=messages",
        });
      }
      const client = await loadProfile(env, msg.client_id);
      const edge = await invokeEdgeFunction(env, "notify-callie", {
        type: "message",
        name: client?.name || "Mama",
        email: client?.email || "",
        stats: {
          message: preview,
          clientId: msg.client_id,
        },
      });
      if (edge.ok) {
        emailSent = true;
      } else {
        emailSent = await sendOpsEmailDirect(env, {
          subject: `💬 Message from ${client?.name || "Mama"}`,
          text: [
            `${client?.name || "Mama"} sent you a message in the app.`,
            client?.email ? `Email: ${client.email}` : "",
            "",
            "Preview:",
            preview || "(empty)",
            "",
            "Reply in admin → Messages.",
          ].filter(Boolean).join("\n"),
        });
      }
    } else {
      pushSent = await sendPushToProfile(env, msg.client_id, {
        title: "Callie messaged you",
        body: preview || "Open Messages in the app",
        url: "/dashboard?tab=messages",
      });
      if (pushSent === 0) {
        const contact = await loadUserContact(env, msg.client_id);
        const email = contact.email || "";
        if (email) {
          const mail = await invokeEdgeFunction(env, "message-email", {
            email,
            name: contact.name || "Mama",
            preview,
          });
          if (mail.ok) {
            emailSent = true;
            await logEmailEvent(env, {
              profileId: msg.client_id,
              emailType: "message",
              toEmail: email,
              meta: { messageId },
            });
          } else {
            emailSent = await sendMamaEmailDirect(env, {
              email,
              name: contact.name || "Mama",
              preview,
            });
            if (emailSent) {
              await logEmailEvent(env, {
                profileId: msg.client_id,
                emailType: "message",
                toEmail: email,
                meta: { messageId, via: "resend-direct" },
              });
            }
          }
        }
      }
    }

    return json({ ok: true, pushSent, emailSent });
  } catch (e) {
    console.error("message-notify failed", e);
    return json({ error: "notify failed" }, 500);
  }
}

async function sendPushToProfile(env, profileId, payload) {
  const result = await invokeEdgeFunction(env, "send-push", {
    profileId,
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });
  if (!result.ok) {
    console.warn("send-push edge failed", result);
    return 0;
  }
  return Number(result.data?.sent) || 0;
}

async function sendMamaEmailDirect(env, { email, name, preview }) {
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key || !email) return false;
  const first = String(name || "Mama").trim().split(/\s+/)[0] || "Mama";
  const snippet = String(preview || "").trim().slice(0, 160);
  const appUrl = String(env.APP_URL || "https://www.macrosandmamas.com").replace(/\/$/, "");
  const html = `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;color:#33272E">
    <p>Hi ${escapeHtml(first)},</p>
    <p>Callie left you a message in Macros and Mamas.</p>
    ${snippet ? `<p><i>${escapeHtml(snippet)}</i></p>` : ""}
    <p><a href="${appUrl}/dashboard?tab=messages">Open Messages</a></p>
  </body></html>`;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: "Callie · Macros and Mamas <calista@nourishwithcalista.com>",
      to: [email],
      subject: "Callie sent you a message",
      html,
    }),
  });
  if (!resp.ok) {
    console.error("resend mama email failed", resp.status, await resp.text().catch(() => ""));
    return false;
  }
  return true;
}

async function sendOpsEmailDirect(env, { subject, text }) {
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key) return false;
  const to = [
    env.CALLIE_NOTIFY_EMAIL || "calista@nourishwithcalista.com",
    env.OWNER_NOTIFY_EMAIL || "pgchammas@gmail.com",
  ]
    .flatMap((s) => String(s).split(","))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(to)];
  if (!unique.length) return false;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: "Callie · Macros and Mamas <calista@nourishwithcalista.com>",
      to: unique,
      subject,
      text,
    }),
  });
  if (!resp.ok) {
    console.error("resend ops email failed", resp.status, await resp.text().catch(() => ""));
    return false;
  }
  return true;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadMessage(env, id) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/messages?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

async function loadProfile(env, id) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,name,email,role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return rows[0] || null;
}

async function listAdminIds(env) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?role=eq.admin&select=id`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return [];
  const rows = await resp.json().catch(() => []);
  return (rows || []).map((r) => r.id).filter(Boolean);
}

async function isAdmin(env, userId) {
  const p = await loadProfile(env, userId);
  return p?.role === "admin";
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
