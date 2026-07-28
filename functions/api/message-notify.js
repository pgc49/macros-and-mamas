/* ==================================================================
   /functions/api/message-notify.js
   After a message insert: web push to the correct recipient only.
   Auth required (sender).

   Routing (tight — no cross-thread / no extra-admin fanout):
   - Mama → Callie: push + email ONLY Callie (coach notify emails), never
     other admins (e.g. Tech Guy).
   - Callie/admin → mama: push/email ONLY that mama (client_id).
   - Admin ↔ admin test DM: push/email ONLY the other admin(s) in that
     thread (never the sender; never mamas).
   ================================================================== */

import { invokeEdgeFunction, logEmailEvent, loadUserContact } from "../_shared/supabaseEmail.js";

const DEFAULT_CALLIE_EMAIL = "calista@nourishwithcalista.com";

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

    // Never notify on soft-deleted / empty identity rows.
    if (msg.deleted_at) return json({ ok: true, skipped: "deleted", pushSent: 0, emailSent: false });

    const sender = await loadProfile(env, msg.sender_id);
    const client = await loadProfile(env, msg.client_id);
    if (!sender || !client) return json({ error: "profile missing" }, 400);

    const senderIsAdmin = String(sender.role || "").toLowerCase() === "admin";
    const clientIsAdmin = String(client.role || "").toLowerCase() === "admin";
    const preview = messagePreview(msg);

    let pushSent = 0;
    let emailSent = false;
    let route = "unknown";

    if (!senderIsAdmin && !clientIsAdmin) {
      // Mama → Callie (thread owned by mama). Coach only.
      route = "mama_to_callie";
      const coachIds = await listCallieAdminIds(env);
      for (const coachId of coachIds) {
        if (coachId === msg.sender_id) continue;
        const unreadCount = await countUnreadForProfile(env, coachId, { asAdmin: true });
        pushSent += await sendPushToProfile(env, coachId, {
          title: firstName(client.name) || "Mama",
          body: preview || "Open Messages in admin",
          url: `/admin?tab=messages&client=${encodeURIComponent(msg.client_id)}`,
          unreadCount: unreadCount || 1,
        });
      }
      const edge = await invokeEdgeFunction(env, "notify-callie", {
        type: "message",
        name: client.name || "Mama",
        email: client.email || "",
        stats: {
          message: preview,
          clientId: msg.client_id,
        },
      });
      if (edge.ok) {
        emailSent = true;
      } else {
        emailSent = await sendOpsEmailDirect(env, {
          subject: `💬 Message from ${client.name || "Mama"}`,
          text: [
            `${client.name || "Mama"} sent you a message in the app.`,
            client.email ? `Email: ${client.email}` : "",
            "",
            "Preview:",
            preview || "(empty)",
            "",
            "Reply in admin → Messages.",
          ].filter(Boolean).join("\n"),
        });
      }
    } else if (senderIsAdmin && !clientIsAdmin) {
      // Coach/admin → that mama only (never other admins, never other mamas).
      route = "admin_to_mama";
      if (msg.client_id !== msg.sender_id) {
        const unreadCount = await countUnreadForProfile(env, msg.client_id, { asAdmin: false });
        pushSent = await sendPushToProfile(env, msg.client_id, {
          title: "Callie",
          body: preview || "Open Messages in the app",
          url: "/dashboard?tab=messages",
          unreadCount: unreadCount || 1,
        });
        if (pushSent === 0) {
          const contact = await loadUserContact(env, msg.client_id);
          const email = contact.email || client.email || "";
          if (email) {
            const mail = await invokeEdgeFunction(env, "message-email", {
              email,
              name: contact.name || client.name || "Mama",
              preview,
            });
            if (mail.ok) {
              emailSent = true;
              await logEmailEvent(env, {
                profileId: msg.client_id,
                emailType: "message",
                toEmail: email,
                meta: { messageId, route },
              });
            } else {
              emailSent = await sendMamaEmailDirect(env, {
                email,
                name: contact.name || client.name || "Mama",
                preview,
              });
              if (emailSent) {
                await logEmailEvent(env, {
                  profileId: msg.client_id,
                  emailType: "message",
                  toEmail: email,
                  meta: { messageId, route, via: "resend-direct" },
                });
              }
            }
          }
        }
      }
    } else if (senderIsAdmin && clientIsAdmin) {
      // Admin ↔ admin test DM: only the other admin(s), never mamas.
      route = "admin_to_admin";
      const adminIds = await listAdminIds(env);
      const recipients = adminIds.filter((id) => id !== msg.sender_id);
      for (const adminId of recipients) {
        const unreadCount = await countUnreadForProfile(env, adminId, { asAdmin: true });
        const n = await sendPushToProfile(env, adminId, {
          title: firstName(sender.name) || "Admin",
          body: preview || "Open Messages in admin",
          url: "/admin?tab=messages",
          unreadCount: unreadCount || 1,
        });
        pushSent += n;
        if (n > 0) continue;
        const contact = await loadUserContact(env, adminId);
        const email = contact.email || "";
        if (!email) continue;
        const mail = await invokeEdgeFunction(env, "message-email", {
          email,
          name: contact.name || "Admin",
          preview,
        });
        if (mail.ok) emailSent = true;
        else if (await sendMamaEmailDirect(env, {
          email,
          name: contact.name || "Admin",
          preview,
        })) {
          emailSent = true;
        }
      }
    } else {
      // Mama should never own an admin-as-client_id thread; ignore safely.
      route = "ignored";
    }

    return json({ ok: true, route, pushSent, emailSent });
  } catch (e) {
    console.error("message-notify failed", e);
    return json({ error: "notify failed" }, 500);
  }
}

function messagePreview(msg) {
  const bodyPreview = String(msg.body || "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (bodyPreview) return bodyPreview;
  if (msg.attachment_path) {
    return String(msg.attachment_mime || "").startsWith("image/")
      ? "Sent a photo"
      : "Sent an attachment";
  }
  return "";
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function callieNotifyEmails(env) {
  return [env.CALLIE_NOTIFY_EMAIL || DEFAULT_CALLIE_EMAIL]
    .flatMap((s) => String(s).split(","))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Coach inbox recipients for mama→Callie — Callie only, never Tech Guy. */
async function listCallieAdminIds(env) {
  const emails = callieNotifyEmails(env);
  const admins = await listAdminProfiles(env);
  const matched = admins.filter((a) => emails.includes(String(a.email || "").toLowerCase()));
  if (matched.length) return matched.map((a) => a.id);
  // Fail closed: if emails don't match any admin, push nobody (email path still uses CALLIE_NOTIFY_EMAIL).
  console.warn("listCallieAdminIds: no admin matched CALLIE_NOTIFY_EMAIL", emails);
  return [];
}

async function sendPushToProfile(env, profileId, payload) {
  if (!profileId) return 0;
  const result = await invokeEdgeFunction(env, "send-push", {
    profileId,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    unreadCount: payload.unreadCount,
  });
  if (!result.ok) {
    console.warn("send-push edge failed", result);
    return 0;
  }
  return Number(result.data?.sent) || 0;
}

/** Unread messages waiting for this profile (not sent by them). */
async function countUnreadForProfile(env, profileId, { asAdmin }) {
  if (!profileId) return 0;
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const qs = asAdmin
    ? `select=id&read_at=is.null&deleted_at=is.null&sender_id=neq.${encodeURIComponent(profileId)}`
    : `select=id&client_id=eq.${encodeURIComponent(profileId)}&read_at=is.null&deleted_at=is.null&sender_id=neq.${encodeURIComponent(profileId)}`;
  try {
    const resp = await fetch(`${base}/rest/v1/messages?${qs}`, {
      method: "HEAD",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        Prefer: "count=exact",
      },
    });
    const range = resp.headers.get("content-range") || "";
    const m = range.match(/\/(\d+)\s*$/);
    return m ? Math.max(0, Number(m[1]) || 0) : 0;
  } catch (e) {
    console.warn("countUnreadForProfile failed", e);
    return 0;
  }
}

async function sendMamaEmailDirect(env, { email, name, preview }) {
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key || !email) return false;
  const first = firstName(name) || "Mama";
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
  const unique = [...new Set(callieNotifyEmails(env))];
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

async function listAdminProfiles(env) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(
    `${base}/rest/v1/profiles?role=eq.admin&select=id,name,email,role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return [];
  return (await resp.json().catch(() => [])) || [];
}

async function listAdminIds(env) {
  return (await listAdminProfiles(env)).map((r) => r.id).filter(Boolean);
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
