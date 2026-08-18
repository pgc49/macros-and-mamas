/**
 * Finish create-account so quiz → join gets a live session.
 *
 * Supabase often creates the user but returns no session (confirm-email on,
 * or an existing email hidden as a silent no-session signup). Sign in with
 * the password they just typed instead of leaving them on the same screen.
 */
export function isExistingAccountError(message) {
  return /already|registered|exists/i.test(String(message || ""));
}

/** Supabase hides "email already registered" as a user with empty identities. */
export function signupLooksLikeExistingUser(data) {
  const identities = data?.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}

export async function completeSignup({ signUp, signIn }) {
  const signup = await signUp();
  if (signup.ok) {
    if (signup.session) return { ok: true };
    const signedIn = await signIn();
    if (signedIn.ok) return { ok: true };
    return {
      ok: false,
      needsEmailConfirm: true,
      error: signedIn.error || null,
    };
  }

  if (signup.existingAccount) {
    const signedIn = await signIn();
    if (signedIn.ok) return { ok: true, recoveredExisting: true };
    return {
      ok: false,
      existingAccount: true,
      error: signedIn.error || signup.error || "That email already has an account.",
    };
  }

  return { ok: false, error: signup.error || "Could not create account." };
}
