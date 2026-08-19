/**
 * Visibility for the quiz create-account bounce (join → sign-in).
 * Does not change routing — only reports when the app already decided to
 * send a quiz mama back to /signin.
 */
import * as Sentry from "@sentry/react";
import { PATHS } from "../lib/appPaths";
import { resolveQuizEmail } from "../lib/quizCheckout";
import { joinPathWhenSignedOut } from "./quizAuthHandoff";

export const QUIZ_SIGNUP_BOUNCE = "quiz_signup_bounce";
const DEDUPE_KEY = "mm_quiz_signup_bounce";
const DEDUPE_MS = 30_000;

const memoryDedupe = { fingerprint: "", at: 0 };

export function pathFromRedirect(to) {
  if (!to) return "";
  if (typeof to === "string") return to;
  return `${to.pathname || ""}${to.search || ""}`;
}

function searchParams(search) {
  if (search && typeof search.get === "function") return search;
  return new URLSearchParams(String(search || "").replace(/^\?/, ""));
}

function destParams(toPath) {
  const dest = pathFromRedirect(toPath);
  const q = dest.includes("?") ? dest.slice(dest.indexOf("?") + 1) : "";
  return new URLSearchParams(q);
}

/** Quiz / from=quiz only — never a normal leftover-session sign-in. */
export function isQuizSignupBounce({ search, toPath } = {}) {
  const from = searchParams(search);
  const dest = destParams(toPath);
  return from.get("from") === "quiz" || dest.get("from") === "quiz";
}

function readDedupe() {
  try {
    const raw = sessionStorage.getItem(DEDUPE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* private mode */
  }
  return memoryDedupe.fingerprint ? { ...memoryDedupe } : null;
}

function writeDedupe(fingerprint, at) {
  memoryDedupe.fingerprint = fingerprint;
  memoryDedupe.at = at;
  try {
    sessionStorage.setItem(DEDUPE_KEY, JSON.stringify({ fingerprint, at }));
  } catch {
    /* private mode */
  }
}

export function resetQuizSignupBounceDedupe() {
  memoryDedupe.fingerprint = "";
  memoryDedupe.at = 0;
  try {
    sessionStorage.removeItem(DEDUPE_KEY);
  } catch {
    /* private mode */
  }
}

function shouldEmit(fingerprint, now) {
  const prev = readDedupe();
  if (prev?.fingerprint === fingerprint && now - Number(prev.at || 0) < DEDUPE_MS) {
    return false;
  }
  writeDedupe(fingerprint, now);
  return true;
}

/**
 * Sentry warning so Patrick can filter Issues by quiz_signup_bounce.
 * No email / PII. Dedupes the same hop for 30s so a loop cannot flood.
 */
export function captureQuizSignupBounce({
  fromPath,
  toPath,
  userSet,
  emailQueryPresent,
  existingAccountFlip = false,
  search,
  now = Date.now(),
} = {}) {
  const to = pathFromRedirect(toPath);
  if (!isQuizSignupBounce({ search, toPath: to })) return false;

  const fingerprint = `${fromPath || ""}>${to}|flip:${existingAccountFlip ? 1 : 0}`;
  if (!shouldEmit(fingerprint, now)) return false;

  Sentry.captureMessage(QUIZ_SIGNUP_BOUNCE, {
    level: "warning",
    tags: {
      funnel: "quiz_signup",
      surface: "customer",
    },
    extra: {
      fromPath: fromPath || "",
      toPath: to,
      userSet: Boolean(userSet),
      emailQueryPresent: Boolean(emailQueryPresent),
      existingAccountFlip: Boolean(existingAccountFlip),
    },
    fingerprint: [QUIZ_SIGNUP_BOUNCE],
  });
  return true;
}

/**
 * Same signed-out /join destination JoinGate already uses.
 * Captures only when that destination is the quiz create-account screen.
 */
export function signedOutJoinRedirect({ search = "", user = null, authLoading = false } = {}) {
  const to = joinPathWhenSignedOut({ user, authLoading, search });
  if (!to) return null;
  const p = searchParams(search);
  if (!p.get("from") && p.get("email")) p.set("from", "quiz");
  const quizEmail = resolveQuizEmail(p);
  captureQuizSignupBounce({
    fromPath: PATHS.join,
    toPath: to,
    userSet: Boolean(user),
    emailQueryPresent: Boolean(p.get("email") || quizEmail),
    existingAccountFlip: p.get("auth") === "signin",
    search: p,
  });
  return to;
}
