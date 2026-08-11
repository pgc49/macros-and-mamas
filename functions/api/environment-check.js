export async function onRequestGet({ env }) {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "");
  let projectRef = "";
  try {
    projectRef = new URL(supabaseUrl).hostname.split(".")[0] || "";
  } catch {
    projectRef = "";
  }
  return new Response(JSON.stringify({
    environment: String(env.APP_ENVIRONMENT || "unknown"),
    supabaseProjectRef: projectRef,
  }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

