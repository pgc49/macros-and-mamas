import {
  authorizeCron,
  listDueNotificationJobs,
} from "../_shared/messageOutbox.js";
import { onRequestPost as notifyDm } from "./message-notify.js";
import { onRequestPost as notifyChannel } from "./channel-notify.js";

/** Recovery drain: immediate browser calls handle normal delivery; cron retries missed jobs. */
export async function onRequestPost({ request, env }) {
  if (!authorizeCron(request, env)) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const jobs = await listDueNotificationJobs(env, 12);
    const queue = [...jobs];
    const results = [];
    const workers = Array.from({ length: Math.min(4, queue.length || 1) }, async () => {
      while (queue.length) {
        const job = queue.shift();
        const handler = job.message_type === "channel" ? notifyChannel : notifyDm;
        try {
          const childRequest = new Request(request.url, {
            method: "POST",
            headers: {
              authorization: request.headers.get("authorization") || "",
              "content-type": "application/json",
            },
            body: JSON.stringify({ messageId: job.message_id }),
          });
          const resp = await withDeadline(
            handler({ request: childRequest, env }),
            8_000,
          );
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
    const failed = results.filter((item) => !item.ok).length;
    return json({
      ok: true,
      found: jobs.length,
      succeeded: results.filter((item) => item.ok).length,
      failed,
    }, failed > 0 ? 500 : 200);
  } catch (e) {
    console.error("message outbox cron failed", e);
    return json({ error: "outbox drain failed" }, 500);
  }
}

function withDeadline(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("notification processing timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

