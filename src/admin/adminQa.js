/**
 * Patrick's Gmail plus-address QA accounts (pgchammas+…).
 * Hidden from Callie's Home queues and People roster. Not deleted.
 * Does not match pgchammas@gmail.com (no plus).
 */

export function isAdminQaEmail(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  const at = raw.indexOf("@");
  const local = at >= 0 ? raw.slice(0, at) : raw;
  return local.startsWith("pgchammas+");
}

/** True when the profile or auth email is a QA plus-address. */
export function isAdminQaClient(person) {
  if (!person || typeof person !== "object") return false;
  return isAdminQaEmail(person.email)
    || isAdminQaEmail(person.auth_email)
    || isAdminQaEmail(person.authEmail)
    || isAdminQaEmail(person.emailLower);
}
