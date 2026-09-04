/**
 * Only an explicit true means the log write landed.
 * undefined/false used to look like success and that is how
 * Save-to-today hardening missed I-know-the-Macros.
 */
export function logSaveSucceeded(ok) {
  return ok === true;
}
