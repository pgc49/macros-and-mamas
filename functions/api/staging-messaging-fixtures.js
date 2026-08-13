import { createClient } from "@supabase/supabase-js";
import { authorizeCron } from "../_shared/messageOutbox.js";

export async function onRequestPost({ request, env }) {
  if (
    String(env.APP_ENVIRONMENT || "") !== "staging"
    || !authorizeCron(request, env)
  ) {
    return json({ error: "not found" }, 404);
  }
  try {
    const body = await request.json().catch(() => ({}));
    const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
    const supabase = createClient(base, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (body.action === "seed") {
      const messageId = crypto.randomUUID();
      const objectPath = `staging-fixtures/${crypto.randomUUID()}.pdf`;
      const outbox = await supabase.from("message_notification_outbox").insert({
        message_type: "dm",
        message_id: messageId,
        status: "pending",
      });
      if (outbox.error) throw outbox.error;
      const upload = await supabase.storage
        .from("message-attachments")
        .upload(objectPath, new Blob(["staging orphan"], { type: "application/pdf" }));
      if (upload.error) throw upload.error;
      return json({ ok: true, messageId, objectPath });
    }
    if (body.action === "verify") {
      const messageId = String(body.messageId || "");
      const objectPath = String(body.objectPath || "");
      const outbox = await supabase
        .from("message_notification_outbox")
        .select("status")
        .eq("message_id", messageId)
        .maybeSingle();
      if (outbox.error) throw outbox.error;
      const object = await supabase.storage
        .from("message-attachments")
        .download(objectPath);
      const passed = outbox.data?.status === "sent" && !!object.error;
      if (!object.error) {
        await supabase.storage.from("message-attachments").remove([objectPath]);
      }
      return json({
        ok: passed,
        outboxStatus: outbox.data?.status || null,
        orphanRemoved: !!object.error,
      }, passed ? 200 : 409);
    }
    return json({ error: "invalid action" }, 400);
  } catch (error) {
    console.error("staging messaging fixture failed", error);
    return json({ error: "fixture failed" }, 500);
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

