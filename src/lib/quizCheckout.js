/**
 * Handoff between the marketing quiz and SPA checkout.
 * Early $249 unlocks only when the signed-in email matches the quiz lead.
 */

const STORAGE_KEY = "mm_quiz_email";

export function normalizeEmail(value) {
  const raw = String(value || "").trim().toLowerCase();
  // Unencoded + in query strings becomes a space (a+b@x.com → "a b@x.com").
  return raw.replace(/^([^@\s]+)\s+([^@\s]+@)/, "$1+$2");
}

export function rememberQuizEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    /* private mode */
  }
}

export function readStoredQuizEmail() {
  try {
    return normalizeEmail(sessionStorage.getItem(STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

/** Quiz email from ?email= (join/signin) or sessionStorage. */
export function resolveQuizEmail(searchParams) {
  const fromUrl = normalizeEmail(
    searchParams?.get?.("email") || new URLSearchParams(searchParams || "").get("email") || "",
  );
  if (fromUrl) {
    rememberQuizEmail(fromUrl);
    return fromUrl;
  }
  return readStoredQuizEmail();
}

export function emailsMatch(a, b) {
  const left = normalizeEmail(a);
  const right = normalizeEmail(b);
  return Boolean(left && right && left === right);
}

function quizParams({ email, auth } = {}) {
  const params = new URLSearchParams({ from: "quiz" });
  if (auth) params.set("auth", auth);
  const normalized = normalizeEmail(email);
  if (normalized) params.set("email", normalized);
  return params;
}

/** /join?from=quiz&email= — keep the quiz address across leftover-session hops. */
export function quizJoinHref(email) {
  return `/join?${quizParams({ email }).toString()}`;
}

/** /signin?from=quiz&auth=create&email= */
export function quizSignInHref(email, auth = "create") {
  return `/signin?${quizParams({ email, auth }).toString()}`;
}
