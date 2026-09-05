import { createContext, useContext, useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import { supabase } from "../lib/supabase";
import { persistAttributionToProfile } from "../lib/attribution";
import { resetAttachmentUrlCache } from "../lib/attachmentUrls";
import { clearAllPendingSends } from "../lib/pendingSends";
import {
  completeSignIn,
  completeSignup,
  isExistingAccountError,
  signupLooksLikeExistingUser,
} from "./completeSignup";
import { shouldAcceptGetSession } from "./quizAuthHandoff";
import {
  blockedAdminSignupResult,
  isAdminSignupLockedSurface,
} from "./adminSignupLock";
import { confirmEmailRedirectTo, resetPasswordRedirectTo } from "./authRedirects";

async function confirmFreshSignup(email) {
  if (isAdminSignupLockedSurface()) return;
  try {
    await fetch("/api/confirm-fresh-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch (confirmErr) {
    console.error("confirm-fresh-signup failed", confirmErr);
  }
}

function syncSentryUser(nextUser) {
  if (nextUser?.id) {
    // Id only — never email (PII). Replay masking is in instrument.js.
    Sentry.setUser({ id: nextUser.id });
  } else {
    Sentry.setUser(null);
  }
}

const AuthContext = createContext({
  user: null,
  session: null,
  profile: null,
  isAdmin: false,
  loading: true,
  signInWithPassword: async () => ({ error: null }),
  signUpWithPassword: async () => ({ error: null, needsEmailConfirm: false }),
  resetPasswordForEmail: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, status, paid, refunded, week, name, last_name, avatar_path, cohort_label, tier, subscription_status, subscription_current_period_end, subscription_trial_end, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("profile load failed", error);
    return null;
  }
  return data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef(null);

  const refreshProfile = async (userId = user?.id) => {
    if (!userId) {
      setProfile(null);
      return null;
    }
    const p = await fetchProfile(userId);
    setProfile(p);
    return p;
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const next = data.session ?? null;
      if (!shouldAcceptGetSession(next, Boolean(userRef.current))) {
        setLoading(false);
        return;
      }
      setSession(next);
      setUser(next?.user ?? null);
      userRef.current = next?.user ?? null;
      syncSentryUser(next?.user ?? null);
      if (next?.user) await refreshProfile(next.user.id);
      else setProfile(null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (event === "SIGNED_OUT") {
        userRef.current = null;
        setSession(null);
        setUser(null);
        setProfile(null);
        syncSentryUser(null);
        setLoading(false);
        return;
      }
      if (nextSession?.user) {
        userRef.current = nextSession.user;
        setSession(nextSession);
        setUser(nextSession.user);
        syncSentryUser(nextSession.user);
        await refreshProfile(nextSession.user.id);
      }
      setLoading(false);

      // Recovery link lands with a temporary session — send them to set a new password.
      if (event === "PASSWORD_RECOVERY") {
        const path = window.location.pathname;
        if (path !== "/reset-password") {
          window.location.assign(resetPasswordRedirectTo());
        }
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const applySession = (nextSession) => {
    if (!nextSession?.user) return;
    // Set React auth before /join mounts. Waiting only on onAuthStateChange
    // let Join bounce a successful signup back to the sign-in screen.
    userRef.current = nextSession.user;
    setSession(nextSession);
    setUser(nextSession.user);
    syncSentryUser(nextSession.user);
  };

  const signInWithPassword = async (email, password) => {
    const trimmed = email.trim();
    const result = await completeSignIn({
      confirmFresh: () => confirmFreshSignup(trimmed),
      signIn: async () => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (error) return { ok: false, error: error.message };
        applySession(data.session);
        return { ok: true };
      },
    });
    return { error: result.ok ? null : { message: result.error || "Could not sign in." } };
  };

  const stampTermsAndAttribution = async (userId, termsAcceptedAt, termsVersion) => {
    const { error: stampErr } = await supabase
      .from("profiles")
      .update({
        terms_accepted_at: termsAcceptedAt,
        terms_version: termsVersion,
      })
      .eq("id", userId);
    if (stampErr) console.error("terms stamp failed", stampErr);
    try {
      await persistAttributionToProfile(userId);
    } catch (attrErr) {
      console.error("attribution stamp failed", attrErr);
    }
  };

  const signUpWithPassword = async (email, password, { termsAcceptedAt, termsVersion } = {}) => {
    if (isAdminSignupLockedSurface()) {
      return blockedAdminSignupResult();
    }
    if (!termsAcceptedAt || !termsVersion) {
      return { error: { message: "You must agree to the Terms and Conditions to create an account." }, needsEmailConfirm: false };
    }
    const trimmed = email.trim();
    const result = await completeSignup({
      confirmFresh: () => confirmFreshSignup(trimmed),
      signUp: async () => {
        const { data, error } = await supabase.auth.signUp({
          email: trimmed,
          password,
          options: {
            emailRedirectTo: confirmEmailRedirectTo(),
            data: {
              terms_accepted_at: termsAcceptedAt,
              terms_version: termsVersion,
            },
          },
        });
        if (error) {
          return {
            ok: false,
            existingAccount: isExistingAccountError(error.message),
            error: error.message,
          };
        }
        // Confirm-email projects hide "already registered" as a user with no identities.
        if (signupLooksLikeExistingUser(data)) {
          return { ok: false, existingAccount: true, error: "User already registered" };
        }
        if (data.session) applySession(data.session);
        if (data.session?.user?.id) {
          await stampTermsAndAttribution(data.session.user.id, termsAcceptedAt, termsVersion);
        }
        return { ok: true, session: data.session ?? null };
      },
      signIn: async () => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (error) return { ok: false, error: error.message };
        applySession(data.session);
        if (data.session?.user?.id) {
          await stampTermsAndAttribution(data.session.user.id, termsAcceptedAt, termsVersion);
        }
        return { ok: true };
      },
    });

    if (result.ok) {
      return { error: null, needsEmailConfirm: false };
    }
    if (result.needsEmailConfirm) {
      return { error: null, needsEmailConfirm: true };
    }
    return {
      error: { message: result.error || "Could not create account." },
      needsEmailConfirm: false,
      existingAccount: Boolean(result.existingAccount),
    };
  };

  /**
   * Sign out this browser only. Supabase defaults to `global`, which revokes
   * every session for the user — one tab could kill a signup happening in
   * another tab (and a phone session too).
   */
  const signOut = async () => {
    userRef.current = null;
    setSession(null);
    setUser(null);
    setProfile(null);
    syncSentryUser(null);
    // Message attachment URLs are cached to keep image `src` stable between
    // refreshes. They outlive the session unless dropped here.
    resetAttachmentUrlCache();
    clearAllPendingSends();
    await supabase.auth.signOut({ scope: "local" });
  };

  const resetPasswordForEmail = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: resetPasswordRedirectTo(),
    });
    return { error };
  };

  const updatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  };

  const value = {
    user,
    session,
    profile,
    isAdmin: profile?.role === "admin",
    loading,
    signInWithPassword,
    signUpWithPassword,
    resetPasswordForEmail,
    updatePassword,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
