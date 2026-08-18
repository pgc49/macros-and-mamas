import { EMAIL_TYPE_LABELS } from "../content/emailCatalog";

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
  const first = String(profile?.name || event?.profile_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  const named = [first, last].filter(Boolean).join(" ");
  const email = to || String(profile?.email || event?.profile_email || "").trim();
  if (named) return { name: named, email, coach: false };
  if (email.includes("@")) {
    return { name: email.split("@")[0], email, coach: false };
  }
  return { name: email || "Unknown recipient", email, coach: false };
}
