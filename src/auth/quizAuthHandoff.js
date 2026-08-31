import { PATHS, canonicalPath } from "../lib/appPaths";
import {
  emailsMatch,
  normalizeEmail,
  quizJoinHref,
  quizSignInHref,
  resolveQuizEmail,
} from "../lib/quizCheckout";
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
 * Quiz email straight from the URL, never sessionStorage.
 * A stored address from an earlier attempt must not make the signed-in
 * account look wrong and block her checkout.
 */
export function urlQuizEmail(searchParams) {
  const raw = searchParams?.get?.("email")
    || new URLSearchParams(searchParams || "").get("email")
    || "";
  return normalizeEmail(raw);
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

/**
 * After a session exists on /signin, where to send her.
 *
 * hold   — still reading auth or the profile row (`paid` is false until then)
 * signin — show the form
 * go     — Navigate to `to`
 * home   — call homePathFor with the loaded profile
 *
 * A returning mama used to flash /join because SignInGate called homePathFor
 * while `paid` was still the signed-out default. Quiz Lock my spot (`from=quiz`
 * in the URL only) still goes to checkout immediately.
 *
 * Do not key this off the handoff stamp — SignInPage marks it on every
 * Welcome-back sign-in, not just the quiz funnel.
 */
export function signInPostAuthDecision({
  user,
  authLoading,
  loaded,
  fromQuiz,
  quizEmail,
  fromPath,
} = {}) {
  if (authLoading) return { action: "hold" };
  if (!user) return { action: "signin" };

  if (fromPath && String(fromPath).startsWith("/account")) {
    return { action: "go", to: fromPath };
  }
  if (fromPath === PATHS.support) return { action: "go", to: PATHS.support };
  if (fromPath === PATHS.membership) return { action: "go", to: PATHS.membership };

  if (fromQuiz) {
    return { action: "go", to: quizJoinHref(quizEmail || user.email) };
  }

  if (!loaded) return { action: "hold" };
  return { action: "home" };
}

/**
 * Skip the App-level "wait for profile" hold only for the quiz pay funnel.
 * /signin without from=quiz must wait — that skip is what painted checkout
 * for a paid mama after Welcome back.
 */
export function shouldSkipProfileHold({ pathname, fromQuiz } = {}) {
  const here = canonicalPath(pathname);
  if (here === PATHS.join) return true;
  return here === PATHS.signin && Boolean(fromQuiz);
}

/**
 * /join after a session exists. Don't paint Stripe while `paid` is still the
 * signed-out default unless this is the quiz handoff (URL `from=quiz`).
 */
export function joinAfterAuthDecision({
  loaded,
  fromQuiz,
  paid,
  isAdmin,
  refunded,
} = {}) {
  if (refunded) return { action: "goodbye" };
  if ((paid || isAdmin) && (loaded || fromQuiz)) return { action: "home" };
  // Caller already decided "stay" (React user or a live JWT). Do not require
  // `user` here — a late React user with paid still false used to paint Stripe.
  if (!loaded && !fromQuiz) return { action: "hold" };
  return { action: "checkout" };
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
