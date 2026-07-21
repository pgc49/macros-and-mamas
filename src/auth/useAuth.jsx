import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

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
    .select("id, role, status, paid, refunded, week, name")
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
      if (next?.user) await refreshProfile(next.user.id);
      else setProfile(null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
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

  const signInWithPassword = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error };
  };

  const signUpWithPassword = async (email, password, { termsAcceptedAt, termsVersion } = {}) => {
    if (!termsAcceptedAt || !termsVersion) {
      return { error: { message: "You must agree to the Terms and Conditions to create an account." }, needsEmailConfirm: false };
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          terms_accepted_at: termsAcceptedAt,
          terms_version: termsVersion,
        },
      },
    });
    // If email confirmation is required, session stays null until they confirm.
    // Acceptance is also written onto profiles via the signup trigger + metadata.
    const needsEmailConfirm = !error && !data.session;

    // When a session exists immediately, stamp the profile row as a backup
    // (trigger may race or an older trigger may not copy metadata yet).
    if (!error && data.session?.user?.id) {
      const { error: stampErr } = await supabase
        .from("profiles")
        .update({
          terms_accepted_at: termsAcceptedAt,
          terms_version: termsVersion,
        })
        .eq("id", data.session.user.id);
      if (stampErr) console.error("terms stamp failed", stampErr);
    }

    return { error, needsEmailConfirm };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
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
