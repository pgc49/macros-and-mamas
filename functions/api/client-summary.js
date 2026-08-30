/* ==================================================================
   /functions/api/client-summary.js — admin-only client card summary
   ==================================================================
   Auth: admin JWT. Reuses OpenRouter helper. v1 payload must not include
   DM bodies, photos, or group posts (asserted before the model call).
   ================================================================== */

import {
  callOpenRouter,
  logAiFailure,
  parseJsonLoose,
  resolveModels,
} from "../_shared/openrouter.js";
import {
  assertNoMessageBodies,
  CLIENT_SUMMARY_HINT,
} from "../../src/admin/clientSummaryPayload.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENROUTER_API_KEY) {
      console.error("missing OPENROUTER_API_KEY");
      return json({ error: "summary unavailable", message: "AI helper is offline." }, 503);
    }

    const admin = await requireUser(request, env);
    if (!admin) return json({ error: "unauthorized" }, 401);
    if (!(await checkAdmin(env, admin.id))) return json({ error: "forbidden" }, 403);

    const body = await request.json().catch(() => ({}));
    const clientId = body.clientId;
    const payload = body.payload;
    if (!clientId) return json({ error: "missing clientId" }, 400);
    if (!payload || typeof payload !== "object") {
      return json({ error: "missing payload" }, 400);
    }
    if (!assertNoMessageBodies(payload)) {
      return json({ error: "payload rejected", message: "Message bodies cannot be sent to the model." }, 400);
    }

    const models = resolveModels(env);
    const result = await callOpenRouter({
      env,
      label: "client_summary",
      models,
      maxTokens: 600,
      temperature: 0.2,
      timeoutMs: 24_000,
      messages: [
        {
          role: "system",
          content:
            "You write a short coaching snapshot for Callie about one postpartum client. Descriptive only. Never invent facts. Never diagnose. Never quote private messages — none are in the payload.",
        },
        {
          role: "user",
          content: `${JSON.stringify(payload)}\n\n${CLIENT_SUMMARY_HINT}`,
        },
      ],
    });

    if (!result.ok) {
      await logAiFailure(env, {
        userId: admin.id,
        label: "client_summary",
        kind: result.kind,
        status: result.status,
        detail: result.detail,
      });
      return json({ error: "summary unavailable", message: "Summary unavailable" }, 502);
    }

    const parsed = parseJsonLoose(result.text);
    if (!parsed.ok || !parsed.value?.summary) {
      await logAiFailure(env, {
        userId: admin.id,
        label: "client_summary",
        kind: "parse",
        model: result.model,
        detail: result.text.slice(0, 300),
      });
      return json({ error: "summary unavailable", message: "Summary unavailable" }, 502);
    }

    return json({
      ok: true,
      summary: String(parsed.value.summary).slice(0, 2000),
      suggested_touch: parsed.value.suggested_touch
        ? String(parsed.value.suggested_touch).slice(0, 500)
        : "",
      model: result.model,
    });
  } catch (e) {
    console.error("client-summary failed", e);
    return json({ error: "summary failed" }, 500);
  }
}

async function requireUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!base) return null;
  const resp = await fetch(`${base.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.ANON_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "",
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function checkAdmin(env, userId) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return false;
  const resp = await fetch(
    `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!resp.ok) return false;
  const rows = await resp.json().catch(() => []);
  return rows[0]?.role === "admin";
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
