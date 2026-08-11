import { requireAdmin } from "../_shared/messagingRuntime.js";

export async function onRequestPost({ request, env }) {
  const user = await requireAdmin(request, env);
  if (!user) return json({ error: "forbidden" }, 403);
  try {
    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();
    if (reason.length < 3) return json({ error: "reason required" }, 400);
    const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
    if (!base || !key) throw new Error("missing Supabase config");
    const response = await fetch(
      `${base}/rest/v1/rpc/acknowledge_dead_notification_jobs`,
      {
        method: "POST",
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ p_actor_id: user.id, p_reason: reason }),
      },
    );
    if (!response.ok) throw new Error(`acknowledgement failed (${response.status})`);
    const affected = Number(await response.json().catch(() => 0)) || 0;
    console.warn("dead message notifications acknowledged", {
      actorId: user.id,
      affected,
    });
    return json({ ok: true, acknowledged: affected });
  } catch (error) {
    console.error("message outbox acknowledgement failed", error);
    return json({ error: "acknowledgement failed" }, 500);
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

