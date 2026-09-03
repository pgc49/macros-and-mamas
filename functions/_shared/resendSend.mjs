/**
 * Resend send helper for Pages Functions.
 * The official SDK returns { data, error } and does not throw on API errors.
 * This fetch wrapper matches that contract and always sends an idempotency key.
 */

export const RESEND_IDEMPOTENCY_MAX = 256;

export function resendIdempotencyKey(eventType, entityId) {
  const type = String(eventType || "").trim();
  const id = String(entityId || "").trim();
  if (!type || !id) return "";
  return `${type}/${id}`.slice(0, RESEND_IDEMPOTENCY_MAX);
}

export function readResendResult(json, httpStatus) {
  const body = json && typeof json === "object" ? json : {};
  if (body.error && !body.data) {
    const err = body.error;
    return {
      data: null,
      error: {
        message: String(err.message || err || "resend error"),
        statusCode: err.statusCode || httpStatus || null,
        name: err.name || null,
      },
    };
  }
  if (body.data && body.data.id) {
    return { data: { id: body.data.id }, error: null };
  }
  if (httpStatus >= 200 && httpStatus < 300 && body.id) {
    return { data: { id: body.id }, error: null };
  }
  return {
    data: null,
    error: {
      message: String(body.message || `resend ${httpStatus || "error"}`),
      statusCode: body.statusCode || httpStatus || null,
      name: body.name || null,
    },
  };
}

export async function sendResendEmail(env, payload, { idempotencyKey } = {}) {
  const key = String(idempotencyKey || "").trim().slice(0, RESEND_IDEMPOTENCY_MAX);
  if (!env?.RESEND_API_KEY) {
    return { data: null, error: { message: "missing_api_key" } };
  }
  if (!key) {
    return { data: null, error: { message: "missing_idempotency_key" } };
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => ({}));
    return readResendResult(json, resp.status);
  } catch (e) {
    return { data: null, error: { message: String(e?.message || e) } };
  }
}
