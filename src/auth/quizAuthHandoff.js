import { PATHS } from "../lib/appPaths";
import { emailsMatch, quizSignInHref, resolveQuizEmail } from "../lib/quizCheckout";
import { isExistingAccountError } from "./completeSignup";

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
} = {}) {
  if (user || supabaseHasSession) return "stay";
  if (authLoading || !probeDone) return "hold";
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
