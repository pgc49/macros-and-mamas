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
    const mode = String(body.mode || "").trim();
    if (!MODES.has(mode)) return json({ error: "invalid mode" }, 400);
    if (typeof body.attachmentsEnabled !== "boolean") {
      return json({ error: "attachmentsEnabled required" }, 400);
    }
    if (typeof body.notificationsEnabled !== "boolean") {
      return json({ error: "notificationsEnabled required" }, 400);
    }
    const reason = String(body.reason || "").trim().slice(0, 200);
    const runtime = await updateMessagingRuntime(env, {
      mode,
      attachments_enabled: body.attachmentsEnabled,
      notifications_enabled: body.notificationsEnabled,
      reason,
    }, user.id);
    console.warn("messaging runtime changed", {
      mode,
      attachmentsEnabled: body.attachmentsEnabled,
      notificationsEnabled: body.notificationsEnabled,
      updatedBy: user.id,
    });
    return json({ ok: true, runtime });
  } catch (error) {
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

