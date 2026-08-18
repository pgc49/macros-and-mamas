import {
  authorizeCron,
  createJobDeadline,
  listDueNotificationJobs,
  NOTIFICATION_JOB_TIMEOUT_MS,
} from "../_shared/messageOutbox.js";
import { onRequestPost as notifyDm } from "./message-notify.js";
import { onRequestPost as notifyChannel } from "./channel-notify.js";

/** Recovery drain: immediate browser calls handle normal delivery; cron retries missed jobs. */
export async function onRequestPost(context) {
  return drainNotificationOutbox(context);
}

export async function drainNotificationOutbox({
  request,
  env,
  waitUntil,
  timeoutMs = NOTIFICATION_JOB_TIMEOUT_MS,
}) {
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
        const deadline = createJobDeadline(timeoutMs);
        try {
          const childRequest = new Request(request.url, {
            method: "POST",
            headers: {
              authorization: request.headers.get("authorization") || "",
              "content-type": "application/json",
            },
            body: JSON.stringify({ messageId: job.message_id }),
          });
          // Await the handler after abort so it can finish() the in-flight claim.
          const resp = await handler({
            request: childRequest,
            env,
            waitUntil,
            signal: deadline.signal,
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
        } finally {
          deadline.cancel();
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

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
