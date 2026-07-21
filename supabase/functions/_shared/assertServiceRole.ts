/** Reject calls that are not using the service role key (server-to-server only). */
export function assertServiceRole(req: Request): Response | null {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

  if (!serviceKey || !token || token !== serviceKey) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: {
        "content-type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  return null;
}
