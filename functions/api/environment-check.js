export async function onRequestGet({ env }) {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "");
  let projectRef = "";
  try {
    projectRef = new URL(supabaseUrl).hostname.split(".")[0] || "";
  } catch {
    projectRef = "";
  }
  let messagingSchemaVersion = "unknown";
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (supabaseUrl && serviceKey) {
    try {
      const response = await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/messaging_schema_version`,
        {
          method: "POST",
          headers: {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
            "content-type": "application/json",
          },
          body: "{}",
        },
      );
      if (response.ok) {
        messagingSchemaVersion = String(await response.json()).replaceAll('"', "");
      }
    } catch {
      messagingSchemaVersion = "unknown";
    }
  }
  return new Response(JSON.stringify({
    environment: String(env.APP_ENVIRONMENT || "unknown"),
    supabaseProjectRef: projectRef,
    messagingSchemaVersion,
    adminAppUrl: String(env.ADMIN_APP_URL || ""),
  }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

