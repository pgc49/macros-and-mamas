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
  signInWithEmail: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, status, paid, week, name")
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

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) await refreshProfile(nextSession.user.id);
      else setProfile(null);
      setLoading(false);
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

  const signUpWithPassword = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    // If email confirmation is required, session stays null until they confirm
    const needsEmailConfirm = !error && !data.session;
    return { error, needsEmailConfirm };
  };

  // Optional fallback — hits Supabase email rate limits on free built-in SMTP
  const signInWithEmail = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const value = {
    user,
    session,
    profile,
    isAdmin: profile?.role === "admin",
    loading,
    signInWithPassword,
    signUpWithPassword,
    signInWithEmail,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
