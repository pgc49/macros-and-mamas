import { authorizeCron } from "../_shared/messageOutbox.js";
import {
  loadMessagingHealth,
  requireAdmin,
} from "../_shared/messagingRuntime.js";

async function handle(request, env) {
  const cron = authorizeCron(request, env);
  const admin = cron ? null : await requireAdmin(request, env);
  if (!cron && !admin) return json({ error: "forbidden" }, 403);
  try {
    const health = await loadMessagingHealth(env);
    const unhealthy = health.outbox.dead > 0
      || (
        health.runtime.notifications_enabled
        && health.outbox.oldestAgeSeconds > 10 * 60
      )
      || health.outbox.staleProcessing > 0;
    if (unhealthy) {
      console.error("messaging health degraded", {
        outbox: health.outbox,
        mode: health.runtime.mode,
      });
    }
    return json({
      ok: !unhealthy,
      checkedAt: new Date().toISOString(),
      ...health,
    }, unhealthy ? 503 : 200);
  } catch (error) {
    console.error("messaging health failed", error);
    return json({ error: "health check failed" }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  return handle(request, env);
}

export async function onRequestPost({ request, env }) {
  return handle(request, env);
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

