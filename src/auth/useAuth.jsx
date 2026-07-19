import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext({
  user: null,
  session: null,
  profile: null,
  isAdmin: false,
  loading: true,
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
    signInWithEmail,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
