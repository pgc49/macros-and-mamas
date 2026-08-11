import {
  authorizeCron,
  listDueNotificationJobs,
} from "../_shared/messageOutbox.js";

/** Recovery drain: immediate browser calls handle normal delivery; cron retries missed jobs. */
export async function onRequestPost({ request, env }) {
  if (!authorizeCron(request, env)) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const jobs = await listDueNotificationJobs(env, 24);
    const queue = [...jobs];
    const results = [];
    const workers = Array.from({ length: Math.min(4, queue.length || 1) }, async () => {
      while (queue.length) {
        const job = queue.shift();
        const endpoint = job.message_type === "channel"
          ? "/api/channel-notify"
          : "/api/message-notify";
        try {
          const resp = await fetch(new URL(endpoint, request.url), {
            method: "POST",
            headers: {
              authorization: request.headers.get("authorization") || "",
              "content-type": "application/json",
            },
            body: JSON.stringify({ messageId: job.message_id }),
          });
          results.push({
            id: job.id,
            type: job.message_type,
            ok: resp.ok,
            status: resp.status,
          });
        } catch (e) {
          console.warn("outbox cron invoke failed", job.id, e);
          results.push({
            id: job.id,
            type: job.message_type,
            ok: false,
            status: 0,
          });
        }
      }
    });
    await Promise.all(workers);
    return json({
      ok: true,
      found: jobs.length,
      succeeded: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
    });
  } catch (e) {
    console.error("message outbox cron failed", e);
    return json({ error: "outbox drain failed" }, 500);
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

