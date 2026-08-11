import { createClient } from "@supabase/supabase-js";
import { authorizeCron } from "../_shared/messageOutbox.js";

export async function onRequestPost({ request, env }) {
  if (!authorizeCron(request, env)) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
    if (!base || !key) throw new Error("missing Supabase configuration");
    const supabase = createClient(base, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const before = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: rows, error: findError } = await supabase.rpc(
      "find_orphan_message_attachments",
      { p_before: before, p_limit: 200 },
    );
    if (findError) throw findError;
    const names = (rows || []).map((row) => row.name).filter(Boolean);
    if (names.length) {
      const { error: removeError } = await supabase.storage
        .from("message-attachments")
        .remove(names);
      if (removeError) throw removeError;
    }
    return json({ ok: true, removed: names.length, before });
  } catch (error) {
    console.error("message attachment GC failed", error);
    return json({ error: "attachment cleanup failed" }, 500);
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

