import { EMAIL_TYPE_LABELS } from "../content/emailCatalog";
import { joinPersonName } from "../lib/personName";

export function normalizeEmailAddress(email) {
  return String(email || "").trim().toLowerCase();
}

/** Sends actually addressed to this lead. Case-insensitive to_email; ignores Callie notifies. */
export function eventsForLeadEmail(events, email) {
  const target = normalizeEmailAddress(email);
  if (!target) return [];
  return (Array.isArray(events) ? events : []).filter(
    (event) => normalizeEmailAddress(event?.to_email) === target,
  );
}

/** Opens Callie's default mail app. Pass subject/body to prefill a draft. */
export function leadMailtoHref(email, { subject, body, maxLen } = {}) {
  const to = String(email || "").trim();
  if (!to.includes("@")) return "";
  const subj = subject == null ? "Macros and Mamas" : String(subject);
  const parts = [];
  if (subj) parts.push(`subject=${encodeURIComponent(subj)}`);
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  const href = `mailto:${to}${parts.length ? `?${parts.join("&")}` : ""}`;
  if (body && maxLen && href.length > maxLen) {
    return `mailto:${to}?subject=${encodeURIComponent(subj)}`;
  }
  return href;
}

export function emailTypeLabel(event) {
  const type = String(event?.email_type || "").trim();
  if (type === "message") {
    const route = event?.meta?.route;
    if (route === "admin_to_mama") return "Message to mama";
    if (route === "mama_to_admin") return "Mama messaged Callie";
    return "Message email";
  }
  return EMAIL_TYPE_LABELS[type] || type || "Email";
}

/** Who received this send — name + address. Never just a generic type. */
export function emailRecipient(event) {
  const profile = event?.profiles || null;
  const to = String(event?.to_email || "").trim();
  if (to === "callie") {
    return {
      name: "Callie",
      email: "calista@nourishwithcalista.com",
      coach: true,
    };
  }
  const named = joinPersonName(
    profile?.name || event?.profile_name || "",
    profile?.last_name || "",
  );
  const email = to || String(profile?.email || event?.profile_email || "").trim();
  if (named) return { name: named, email, coach: false };
  if (email.includes("@")) {
    return { name: email.split("@")[0], email, coach: false };
  }
  return { name: email || "Unknown recipient", email, coach: false };
}

/** Client-side search for the admin send log — name, email, type, or subject. */
export function filterEmailEvents(events, query) {
  const q = String(query || "").trim().toLowerCase();
  const rows = Array.isArray(events) ? events : [];
  if (!q) return rows;
  return rows.filter((event) => {
    const who = emailRecipient(event);
    const hay = [
      who.name,
      who.email,
      emailTypeLabel(event),
      event?.email_type,
      event?.subject,
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
}
