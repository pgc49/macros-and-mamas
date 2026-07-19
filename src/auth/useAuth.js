/* ------------------------------------------------------------------ */
/*  PROD-TODO: AUTH — replace this stub with Supabase Auth.            */
/*  Requirements:                                                      */
/*   - email magic-link or password auth for clients                   */
/*   - Callie's account carries an `admin` role (profiles.role)        */
/*   - isAdmin unlocks the admin portal below; RLS enforces it         */
/*     server-side too (never trust this flag alone)                   */
/* ------------------------------------------------------------------ */
export function useAuth() {
  // PROD-TODO(auth): wire to supabase.auth.getSession() / onAuthStateChange
  return { user: null, isAdmin: false, signOut: () => {} };
}
