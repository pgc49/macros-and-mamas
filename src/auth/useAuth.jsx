import { createContext, useContext, useEffect, useState } from "react";
import * as Sentry from "@sentry/react";
import { supabase } from "../lib/supabase";
import { persistAttributionToProfile } from "../lib/attribution";
import {
  completeSignIn,
  completeSignup,
  isExistingAccountError,
  signupLooksLikeExistingUser,
} from "./completeSignup";

async function confirmFreshSignup(email) {
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
      setSession(next);
      setUser(next?.user ?? null);
      syncSentryUser(next?.user ?? null);
      if (next?.user) await refreshProfile(next.user.id);
      else setProfile(null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      syncSentryUser(nextSession?.user ?? null);
      if (nextSession?.user) await refreshProfile(nextSession.user.id);
      else setProfile(null);
      setLoading(false);

      // Recovery link lands with a temporary session — send them to set a new password.
      if (event === "PASSWORD_RECOVERY") {
        const path = window.location.pathname;
        if (path !== "/reset-password") {
          window.location.assign(`${window.location.origin}/reset-password`);
        }
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const applySession = (session) => {
    if (!session?.user) return;
    // Set React auth before /join mounts. Waiting only on onAuthStateChange
    // let Join bounce a successful signup back to the sign-in screen.
    setSession(session);
    setUser(session.user);
    syncSentryUser(session.user);
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
            emailRedirectTo: window.location.origin,
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    syncSentryUser(null);
  };

  const resetPasswordForEmail = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
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
