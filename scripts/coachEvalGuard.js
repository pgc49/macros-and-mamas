/** Live eval may only run as a labeled QA plus-address. */
export const EVAL_TOKEN_EMAIL_RE = /^pgchammas\+qa-[a-z0-9-]+@gmail\.com$/;

export function evalTokenEmailAllowed(email) {
  return EVAL_TOKEN_EMAIL_RE.test(String(email || "").trim().toLowerCase());
}

/**
 * The JWT is the source of truth. --account is a label and cannot bypass this.
 */
export async function verifyCoachEvalToken({
  token,
  supabaseUrl = process.env.SUPABASE_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = String(supabaseUrl || "").replace(/\/$/, "");
  if (!base || !token) return { ok: false, reason: "missing" };
  const resp = await fetchImpl(`${base}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",
    },
  }).catch(() => null);
  const data = resp ? await resp.json().catch(() => ({})) : {};
  const email = String(data?.email || "").trim().toLowerCase();
  if (!evalTokenEmailAllowed(email)) return { ok: false, reason: "email", email };
  return { ok: true, email };
}
