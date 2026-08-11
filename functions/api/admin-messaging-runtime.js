import {
  loadMessagingRuntime,
  requireAdmin,
  updateMessagingRuntime,
} from "../_shared/messagingRuntime.js";

const MODES = new Set(["normal", "read_only", "off"]);

export async function onRequestGet({ request, env }) {
  const user = await requireAdmin(request, env);
  if (!user) return json({ error: "forbidden" }, 403);
  try {
    return json({ ok: true, runtime: await loadMessagingRuntime(env) });
  } catch (error) {
    console.error("admin messaging runtime load failed", error);
    return json({ error: "runtime load failed" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const user = await requireAdmin(request, env);
  if (!user) return json({ error: "forbidden" }, 403);
  try {
    const body = await request.json().catch(() => ({}));
    const expectedUpdatedAt = String(body.expectedUpdatedAt || "").trim();
    if (!expectedUpdatedAt) return json({ error: "expectedUpdatedAt required" }, 400);
    const hasMode = body.mode != null;
    const mode = hasMode ? String(body.mode).trim() : null;
    if (hasMode && !MODES.has(mode)) return json({ error: "invalid mode" }, 400);
    const hasAttachments = body.attachmentsEnabled != null;
    if (hasAttachments && typeof body.attachmentsEnabled !== "boolean") {
      return json({ error: "attachmentsEnabled must be boolean" }, 400);
    }
    const hasNotifications = body.notificationsEnabled != null;
    if (hasNotifications && typeof body.notificationsEnabled !== "boolean") {
      return json({ error: "notificationsEnabled must be boolean" }, 400);
    }
    const hasReason = body.reason != null;
    if (!hasMode && !hasAttachments && !hasNotifications && !hasReason) {
      return json({ error: "no runtime changes provided" }, 400);
    }
    const reason = hasReason ? String(body.reason).trim().slice(0, 200) : undefined;
    const requestId = crypto.randomUUID();
    const runtime = await updateMessagingRuntime(env, {
      ...(hasMode ? { mode } : {}),
      ...(hasAttachments ? { attachments_enabled: body.attachmentsEnabled } : {}),
      ...(hasNotifications ? { notifications_enabled: body.notificationsEnabled } : {}),
      ...(hasReason ? { reason } : {}),
    }, user.id, expectedUpdatedAt, requestId);
    console.warn("messaging runtime changed", {
      mode: runtime.mode,
      attachmentsEnabled: runtime.attachments_enabled,
      notificationsEnabled: runtime.notifications_enabled,
      updatedBy: user.id,
      requestId,
    });
    return json({ ok: true, runtime });
  } catch (error) {
    if (error.code === "CONFLICT") {
      return json({ error: "Messaging controls changed in another session. Refresh and retry." }, 409);
    }
    console.error("admin messaging runtime update failed", error);
    return json({ error: "runtime update failed" }, 500);
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

