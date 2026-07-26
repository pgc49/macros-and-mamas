/* ==================================================================
   /functions/_shared/openrouter.js — one reliable OpenRouter client
   ==================================================================
   Every AI feature (estimate, meal-suggest, meal-idea, meal-plan) calls
   through here so reliability is fixed in one place:

     1. Model-layer fallback — OpenRouter `models` array walks our chain
        when the primary model is down, rate-limited, or refuses.
     2. Provider-layer failover — `allow_fallbacks` (OpenRouter default)
        retries other providers serving the same model.
     3. Our own retry — covers what OpenRouter cannot: our fetch timing
        out, TLS/network resets, and malformed upstream JSON.
     4. Always a typed failure — callers get { ok:false, kind } and can
        return real JSON to the client instead of a bare gateway 502.
     5. Failure telemetry — logAiFailure writes to public.ai_failures so
        we find out from the dashboard, not from a client texting Callie.

   Two model chains (Gemini 2.5 Flash family retires Oct 2026 — stay on 3.x):

     ESTIMATE_MODEL_CHAIN — Snap / Describe. Cheap lite models; short JSON.
     PLAN_MODEL_CHAIN     — Suggest my week / meal-plan / meal-idea. Full
                            Flash for reliable 7-day structured JSON; lite
                            only as last resort.

   Secrets: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   Optional: MEAL_PLAN_MODEL — overrides the *planning* primary only
             (never Snap/Describe — those stay on the lite chain).
   ================================================================== */

/** Snap / Describe — short plate JSON. Vision-capable, cheap. */
export const ESTIMATE_MODEL_CHAIN = [
  "google/gemini-3.1-flash-lite",
  "google/gemini-3.5-flash-lite",
];

/**
 * Week planning — big nested JSON (7 days × meals). Full Flash first;
 * Google's durable successor to 2.5 Flash. Lite only as a last fallback.
 */
export const PLAN_MODEL_CHAIN = [
  "google/gemini-3.6-flash",
  "google/gemini-3.5-flash",
  "google/gemini-3.1-flash-lite",
];

/** @deprecated Use ESTIMATE_MODEL_CHAIN or PLAN_MODEL_CHAIN. */
export const MODEL_CHAIN = ESTIMATE_MODEL_CHAIN;

const DEFAULT_TIMEOUT_MS = 24_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

function withPrimary(chain, primary) {
  const p = String(primary || "").trim().slice(0, 120);
  if (!p) return [...chain];
  return [p, ...chain.filter((m) => m !== p)].slice(0, 4);
}

/** Snap / Describe model list. Never reads MEAL_PLAN_MODEL. */
export function resolveEstimateModels(env, override) {
  return withPrimary(ESTIMATE_MODEL_CHAIN, override);
}

/**
 * Suggest / meal-plan / meal-idea model list.
 * `MEAL_PLAN_MODEL` (or an explicit override) becomes primary; the planning
 * chain stays behind it as fallback.
 */
export function resolvePlanModels(env, override) {
  const primary = override || env?.MEAL_PLAN_MODEL;
  return withPrimary(PLAN_MODEL_CHAIN, primary);
}

/**
 * @deprecated Prefer resolveEstimateModels / resolvePlanModels so a planning
 * env override cannot accidentally upgrade Snap. Kept as an alias of the
 * estimate chain for any leftover callers.
 */
export function resolveModels(env, override) {
  return resolveEstimateModels(env, override);
}

/**
 * Call OpenRouter chat completions and return the assistant text.
 *
 * @returns {Promise<{ok: true, text: string, model: string, attempts: number}
 *                  | {ok: false, kind: string, status: number|null, detail: string, attempts: number}>}
 *
 * kind is one of: config | auth | credits | rate_limited | timeout
 *                 network | upstream | empty
 */
export async function callOpenRouter({
  env,
  label,
  messages,
  models,
  maxTokens = 1000,
  temperature = 0.2,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = MAX_ATTEMPTS,
  jsonObject = true,
}) {
  if (!env?.OPENROUTER_API_KEY) {
    return { ok: false, kind: "config", status: null, detail: "missing OPENROUTER_API_KEY", attempts: 0 };
  }

  const chain = Array.isArray(models) && models.length ? models : ESTIMATE_MODEL_CHAIN;
  let last = { ok: false, kind: "network", status: null, detail: "no attempt made", attempts: 0 };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "http-referer": "https://www.macrosandmamas.com",
          "x-title": `Macros and Mamas${label ? ` ${label}` : ""}`,
        },
        body: JSON.stringify({
          model: chain[0],
          // Model-layer fallback: OpenRouter walks these in order.
          models: chain,
          provider: { allow_fallbacks: true },
          max_tokens: maxTokens,
          temperature,
          messages,
          ...(jsonObject ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const data = await resp.json().catch(() => null);

      if (!data) {
        last = {
          ok: false,
          kind: resp.status >= 500 ? "upstream" : "empty",
          status: resp.status,
          detail: `non-JSON response (status ${resp.status})`,
          attempts: attempt,
        };
      } else if (data.error) {
        const kind = classifyError(resp.status, data.error);
        last = {
          ok: false,
          kind,
          status: resp.status,
          detail: truncate(JSON.stringify(data.error), 400),
          attempts: attempt,
        };
        // Retrying a bad key or empty wallet just burns time.
        if (kind === "auth" || kind === "credits") return last;
      } else {
        const text = data.choices?.[0]?.message?.content || "";
        if (text) {
          return { ok: true, text, model: data.model || chain[0], attempts: attempt };
        }
        last = {
          ok: false,
          kind: "empty",
          status: resp.status,
          detail: `empty content (finish_reason=${data.choices?.[0]?.finish_reason || "unknown"})`,
          attempts: attempt,
        };
      }
    } catch (e) {
      const timedOut = e?.name === "TimeoutError" || /timeout|aborted/i.test(String(e?.message || ""));
      last = {
        ok: false,
        kind: timedOut ? "timeout" : "network",
        status: null,
        detail: truncate(`${e?.name || "Error"}: ${e?.message || String(e)}`, 300),
        attempts: attempt,
      };
    }

    if (attempt < attempts) {
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  console.error(`openrouter ${label || "call"} failed`, last.kind, last.status, last.detail);
  return last;
}

function classifyError(status, error) {
  const blob = `${error?.code || ""} ${error?.type || ""} ${error?.message || ""}`.toLowerCase();
  if (status === 401 || status === 403 || /api key|unauthor|forbidden|invalid key/.test(blob)) return "auth";
  if (status === 402 || /credit|quota|billing|insufficient|payment/.test(blob)) return "credits";
  if (status === 429 || /rate limit|too many/.test(blob)) return "rate_limited";
  if (/timeout|timed out|deadline/.test(blob)) return "timeout";
  if (status >= 500 || /provider|upstream|overload|unavailable/.test(blob)) return "upstream";
  return "upstream";
}

/** Parse a JSON object out of model text that may include prose or fences. */
export function parseJsonLoose(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  try {
    return { ok: true, value: JSON.parse(match ? match[0] : text) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

/**
 * Client-safe copy per failure kind. Never dead-ends — every message
 * names the next thing she can do.
 */
export function messageForKind(kind, { retryLabel = "try again", manualLabel = "log it manually" } = {}) {
  switch (kind) {
    case "config":
      return "The AI helper is offline for maintenance right now — you can still " + manualLabel + ".";
    case "auth":
    case "credits":
      return "The AI helper is temporarily unavailable. Callie has been notified — you can still " + manualLabel + ".";
    case "rate_limited":
      return "The AI helper is busy right now. Give it a minute and " + retryLabel + ".";
    case "timeout":
      return "That took too long to come back. Please " + retryLabel + ".";
    case "empty":
      return "The AI came back empty. Please " + retryLabel + ".";
    default:
      return "Couldn't reach the AI helper right now. Please " + retryLabel + ", or " + manualLabel + ".";
  }
}

/**
 * Record a failure for the admin AI health view. Fire-and-forget: never
 * let telemetry turn a soft failure into a hard one.
 */
export async function logAiFailure(env, { userId, label, kind, status, detail, model }) {
  try {
    const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) return;

    const resp = await fetch(`${base}/rest/v1/ai_failures`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        profile_id: userId || null,
        label: String(label || "unknown").slice(0, 40),
        kind: String(kind || "unknown").slice(0, 30),
        status: Number.isFinite(status) ? status : null,
        model: model ? String(model).slice(0, 120) : null,
        detail: detail ? String(detail).slice(0, 500) : null,
      }),
    });
    if (!resp.ok) {
      console.error("ai_failures insert failed", resp.status, await resp.text());
    }
  } catch (e) {
    console.error("ai_failures insert threw", e);
  }
}

function truncate(s, n) {
  const str = String(s ?? "");
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
