import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { assertServiceRole } from "../_shared/assertServiceRole.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = assertServiceRole(req);
  if (denied) return denied;

  try {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY") || Deno.env.get("VITE_VAPID_PUBLIC_KEY") || "";
    const priv = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    if (!pub || !priv) {
      return jsonResponse({ ok: false, error: "missing VAPID keys", sent: 0 });
    }

    const { profileId, title, body, url } = await req.json();
    if (!profileId) return jsonResponse({ error: "profileId required" }, 400);

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:pgchammas@gmail.com",
      pub,
      priv,
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("profile_id", profileId);
    if (error) {
      console.error("load push subs failed", error);
      return jsonResponse({ error: error.message }, 500);
    }

    let sent = 0;
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
        console.warn("push failed", e?.statusCode || e?.message || e);
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    return jsonResponse({ ok: true, sent });
  } catch (e) {
    console.error("send-push failed", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
