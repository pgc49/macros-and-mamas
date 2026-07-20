/**
 * Read-only catalog of lifecycle emails for the admin UI.
 * Copy lives in Edge Functions for sending; this mirrors it for Callie to review.
 * Edits for early cohort: change functions + this catalog together (via Patrick → agent).
 */

export const EMAIL_CATALOG = [
  {
    id: "welcome",
    number: 2,
    name: "Welcome",
    trigger: "Right after Stripe payment succeeds",
    subject: "You're in, mama 🤍 (here's what happens next)",
    audience: "Client",
    cta: "Complete my intake",
    bodyPreview: `Hi [First name],

Welcome to Macros and Mamas — I'm so glad you're here!

Philosophy (ranges, not rules; eat enough; Callie will tell you to eat more if you lose too fast). Personal story about tracking for 8 weeks.

Here's what happens next:
1. Complete your intake (~3 minutes)
2. Callie builds macros personally (within a day of intake)
3. WhatsApp invite lands by text after approval

Homework: before photos + tomorrow morning weigh-in.

Blessings, Callie`,
  },
  {
    id: "intake_received",
    number: 4,
    name: "Intake received",
    trigger: "Client finishes intake",
    subject: "Got it — I'm building your macros right now",
    audience: "Client",
    cta: "See my pending status",
    bodyPreview: `Hi [First name],

I have your intake — thank you. I'm reviewing your numbers personally and you'll usually have them within a day.

When I approve, your dashboard unlocks and your WhatsApp group invite lands by text.

If your before photos and first weigh-in are still on the list — now's the moment.

Callie`,
  },
  {
    id: "macros_live",
    number: 5,
    name: "Your macros are live",
    trigger: "Callie taps Approve",
    subject: "Your ranges are ready 🤍",
    audience: "Client",
    cta: "Open my dashboard",
    bodyPreview: `Hi [First name],

I just finished your numbers — they're live in your dashboard. Ranges, not rules.

WhatsApp invite is on its way.

First 48 hours:
1. Today — log one meal
2. Tomorrow morning — weigh-in
3. In the group — say hi

Callie`,
  },
  {
    id: "eligibility_refund",
    number: 6,
    name: "Not this time + refund",
    trigger: "Eligibility decline after payment (pregnant / early nursing / diet)",
    subject: "Depends on reason (congratulations / not yet / not the right fit)",
    audience: "Client",
    cta: null,
    bodyPreview: `Hi [First name],

Warm decline copy for the specific reason.

Your $149 has been fully refunded — a few days back to the card.

Waitlist: I'll personally check in when the time is right.

Callie`,
  },
  {
    id: "callie_payment",
    number: "A",
    name: "Callie: new payment",
    trigger: "Stripe payment succeeded",
    subject: "💰 New mama: [name] — paid $149",
    audience: "Callie",
    cta: null,
    bodyPreview: `Plain-text alert with name, email, and link to /admin.`,
  },
  {
    id: "callie_intake",
    number: "B",
    name: "Callie: intake ready",
    trigger: "Intake submitted",
    subject: "✅ [name] finished intake — review + approve",
    audience: "Callie",
    cta: null,
    bodyPreview: `Headline stats (age, weight, breastfeeding, tastes, phone) + deep link to /admin.`,
  },
  {
    id: "callie_refund",
    number: "C",
    name: "Callie: refund issued",
    trigger: "Auto-refund after eligibility decline",
    subject: "↩️ Refund: [name] ([reason]) — waitlisted",
    audience: "Callie",
    cta: null,
    bodyPreview: `Name, email, reason. Reminder they're on the waitlist if they left an email.`,
  },
];

export const EMAIL_TYPE_LABELS = {
  welcome: "Welcome (#2)",
  intake_received: "Intake received (#4)",
  macros_live: "Macros live (#5)",
  eligibility_refund: "Refund confirm (#6)",
  callie_payment: "Callie: new payment (A)",
  callie_intake: "Callie: intake ready (B)",
  callie_refund: "Callie: refund (C)",
};
