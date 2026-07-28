import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

async function assertCaller(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<Response | null> {
  const token = bearerToken(req);
  if (!token) {
    return jsonResponse({ error: "forbidden" }, 403);
  }

  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (serviceKey && token === serviceKey) return null;

  const { data, error } = await supabase
    .from("app_runtime_secrets")
    .select("value")
    .eq("key", "SEND_PUSH_INVOKE_TOKEN")
    .maybeSingle();
  if (error) {
    console.error("load invoke token failed", error);
    return jsonResponse({ error: "forbidden" }, 403);
  }
  if (data?.value && token === data.value) return null;

  return jsonResponse({ error: "forbidden" }, 403);
}

async function loadVapid(supabase: ReturnType<typeof createClient>) {
  let pub = Deno.env.get("VAPID_PUBLIC_KEY") || Deno.env.get("VITE_VAPID_PUBLIC_KEY") || "";
  let priv = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  let subject = Deno.env.get("VAPID_SUBJECT") || "mailto:pgchammas@gmail.com";

  if (pub && priv) return { pub, priv, subject, source: "env" as const };

  const { data, error } = await supabase
    .from("app_runtime_secrets")
    .select("key, value")
    .in("key", ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);
  if (error) {
    console.error("load app_runtime_secrets failed", error);
    return { pub, priv, subject, source: "missing" as const };
  }
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  pub = pub || map.VAPID_PUBLIC_KEY || "";
  priv = priv || map.VAPID_PRIVATE_KEY || "";
  subject = map.VAPID_SUBJECT || subject;
  return { pub, priv, subject, source: pub && priv ? "db" as const : "missing" as const };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const denied = await assertCaller(req, supabase);
    if (denied) return denied;

    const vapid = await loadVapid(supabase);
    if (!vapid.pub || !vapid.priv) {
      return jsonResponse({ ok: false, error: "missing VAPID keys", sent: 0 }, 503);
    }

    const { profileId, title, body, url } = await req.json();
    if (!profileId) return jsonResponse({ error: "profileId required" }, 400);

    webpush.setVapidDetails(vapid.subject, vapid.pub, vapid.priv);

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("profile_id", profileId);
    if (error) {
      console.error("load push subs failed", error);
      return jsonResponse({ error: error.message }, 500);
    }

    let sent = 0;
    const failures: { status?: number; message?: string }[] = [];
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title: title || "Macros and Mamas",
            body: body || "New message",
            url: url || "/dashboard?tab=messages",
          }),
        );
        sent += 1;
      } catch (e) {
        const statusCode = e?.statusCode;
        console.warn("push failed", statusCode || e?.message || e);
        failures.push({ status: statusCode, message: String(e?.message || e).slice(0, 120) });
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    return jsonResponse({
      ok: true,
      sent,
      attempted: (subs || []).length,
      source: vapid.source,
      failures: failures.length ? failures : undefined,
    });
  } catch (e) {
    console.error("send-push failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
