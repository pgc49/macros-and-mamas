import { PATHS } from "../lib/appPaths";
import { emailsMatch, normalizeEmail, quizSignInHref, resolveQuizEmail } from "../lib/quizCheckout";
import { isExistingAccountError } from "./completeSignup";

const HANDOFF_KEY = "mm_quiz_pay_handoff";
const HANDOFF_MS = 2 * 60 * 1000;

/** Stamp a just-finished create/sign-in so /join will not bounce to sign-in. */
export function markQuizPayHandoff(email) {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({
      email: normalizeEmail(email),
      at: Date.now(),
    }));
  } catch {
    /* private mode */
  }
}

export function readQuizPayHandoff() {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.at || Date.now() - Number(data.at) > HANDOFF_MS) {
      sessionStorage.removeItem(HANDOFF_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearQuizPayHandoff() {
  try {
    sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    /* private mode */
  }
}

export function isQuizPayHandoffActive() {
  return Boolean(readQuizPayHandoff());
}

/**
 * Quiz leftover-session switch. Wait if the JWT has no email yet so a
 * brand-new signup is not signed back out before checkout.
 */
export function quizSessionMismatch({ user, fromQuiz, quizEmail }) {
  if (!user || !fromQuiz || !quizEmail) return false;
  if (!user.email) return false;
  return !emailsMatch(user.email, quizEmail);
}

/**
 * /join bounce rules for the paid-quiz funnel.
 * stay  — show checkout (React user or a live Supabase session)
 * hold  — still reading auth; never bounce on this paint
 * signin — truly signed out; send them to create-account
 */
export function joinCheckoutDecision({
  user,
  authLoading,
  probeDone,
  supabaseHasSession,
  handoffActive,
} = {}) {
  if (user || supabaseHasSession) return "stay";
  if (authLoading || !probeDone || handoffActive) return "hold";
  return "signin";
}

/** Stale getSession(null) must not wipe a signup we just applied. */
export function shouldAcceptGetSession(incomingSession, hasAppliedUser) {
  if (incomingSession?.user) return true;
  return !hasAppliedUser;
}

/**
 * Where /join should send a signed-out visitor. Null while auth is still
 * applying the session from create-account — bouncing to /signin here is
 * what made "Continue" look like it failed.
 */
export function joinPathWhenSignedOut({ user, authLoading, search = "" } = {}) {
  if (authLoading || user) return null;
  const params = new URLSearchParams(
    typeof search === "string" ? String(search).replace(/^\?/, "") : search,
  );
  if (!params.get("from") && params.get("email")) params.set("from", "quiz");
  const quizEmail = resolveQuizEmail(params);
  if (params.get("from") === "quiz") {
    return quizSignInHref(quizEmail || params.get("email"), "create");
  }
  params.set("auth", "create");
  if (quizEmail && !params.get("email")) params.set("email", quizEmail);
  const qs = params.toString();
  return { pathname: PATHS.signin, search: qs ? `?${qs}` : "?auth=create" };
}

/** Flip create → sign-in only for a real existing account, not "Invalid login". */
export function shouldSwitchCreateToSignIn({ existingAccount, message } = {}) {
  return Boolean(existingAccount || isExistingAccountError(message));
}
