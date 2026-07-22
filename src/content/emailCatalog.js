/**
 * Read-only catalog of lifecycle emails for the admin UI.
 * Copy lives in Edge Functions for sending; this mirrors it for Callie to review.
 * Edits for early cohort: change functions + this catalog together (via Patrick → agent).
 *
 * Numbers match the email plan (#1–#6 client + Callie A/B/C).
 */

export const EMAIL_CATALOG = [
  {
    id: "finish_joining",
    number: 1,
    name: "Finish joining",
    status: "live",
    trigger: "Account created, still unpaid — +1 hour, again +24 hours, then stop (hourly cron)",
    subject: "Your spot's waiting, mama",
    audience: "Client",
    cta: "Finish joining — $149",
    bodyPreview: `Hi [First name],

You started joining Macros and Mamas — I'm glad you're here.

When you're ready: personalized macros I build myself, our moms WhatsApp group, and a Monday voice note to keep it simple. One button and you're in.

Callie

(24h follow-up adds founding-price scarcity. Reply to stop anytime.)`,
  },
  {
    id: "welcome",
    number: 2,
    name: "Welcome",
    status: "live",
    trigger: "Right after Stripe payment succeeds",
    subject: "You're in, mama 🤍 (here's what happens next)",
    audience: "Client",
    cta: "Complete my intake",
    bodyPreview: `Hi [First name],

Welcome to Macros and Mamas — I'm so glad you're here!

I want to tell you what makes this different, because you've probably tried the other way. This is not a 1,200-calorie plan. We don't crash, we don't punish, and we don't earn our food. We eat enough, we lift, and we lose fat while keeping the muscle that makes us strong enough for everything our lives ask of us. If you ever lose faster than about a pound to a pound and a half a week, I'll be the one telling you to eat more. That's the whole philosophy, and I mean it.

I also want to reinforce that tracking your macros and meals doesn't have to happen for perpetuity! I tracked for 8 weeks, lost 11 pounds, stopped tracking for 3 months (but still used everything I learned as my guide), and I have maintained that 11 pound weight loss! This system works! I was the guinea pig! And now I get to teach you!

Here's what happens next:

First, complete your intake — it takes about 3 minutes. That's where I learn your goals, your season of life, and even the foods you love. The moment you finish, I get to work.

Then your macros get built — not by a calculator — by me. I personally review every mama's numbers before they go live. You'll get them within a day of finishing your intake, as flexible ranges, because real life doesn't happen in exact grams.

Once your macros are approved, your invite to our WhatsApp Macros group is coming by text. That's where I live Monday through Friday — voice notes, plate pics, wins, questions, all of it. Every Monday I drop a short voice note that sets the week's focus. Listen while you pump, nurse, walk, or hide in the pantry. No judgment!

While you're at it, do these two things — today if you can:
1. Take your before photos. Same outfit, same spot, same lighting — front, side, and back. Your face doesn't need to be in them. You will not believe how much you'll want these in eight weeks!
2. Weigh yourself tomorrow morning — first thing, before coffee, before your morning hydration, and right after you pee! That's your starting point, and it's the last time that number gets to feel like a verdict. From here on, it's just data.

That's it. No prep, no pantry purge, no guilt about whatever you ate today.

I'll see you inside, mama! We're going to do this together! I am truly so honored to spend the next 8 weeks with you!

Blessings,
Callie`,
  },
  {
    id: "intake_reminder",
    number: 3,
    name: "Intake reminder",
    status: "live",
    trigger: "Paid, intake incomplete — +24 hours, again +72 hours, then stop (hourly cron)",
    subject: "I can't build your macros yet",
    audience: "Client",
    cta: "Complete my intake",
    bodyPreview: `Hi [First name],

Your spot is paid for, but your numbers are waiting on you — 3 minutes and I'll get to work.

Finish your intake whenever you can; that's what I need before I build your ranges.

Callie

(72h follow-up adds: reply if anything's confusing — I read everything.)`,
  },
  {
    id: "intake_received",
    number: 4,
    name: "Intake received",
    status: "live",
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
    status: "live",
    trigger: "Callie taps Approve",
    subject: "Your ranges are ready 🤍",
    audience: "Client",
    cta: "Open my dashboard",
    bodyPreview: `Hi [First name],

I just finished your numbers — they're live in your dashboard right now, built from everything you told me. Remember: these are ranges, not rules. Active day, eat the top. Slow day, the bottom. Both count.

Join the mamas group chat — I'm in there Monday through Friday answering in voice notes. Come say hi so I can welcome you properly:
[Tap here to join WhatsApp → chat.whatsapp.com/…]

Your first 48 hours, and this is the whole assignment:
1. Today: log one meal. Tap it from your plan, snap it, or type it. Just one.
2. Tomorrow morning: log your weigh-in.
3. In the group: say hi. That's it.

One phone tip that makes this feel like an app: open macrosandmamas.com in Safari (iPhone) or Chrome (Android), tap Share, then Add to Home Screen. You'll get an icon on your phone — tap it anytime and you're right back in your dashboard. No App Store needed.

Small on purpose. Mamas who do these three in the first two days are the ones standing in their week-8 photos amazed. Let's go.

Callie`,
  },
  {
    id: "eligibility_refund",
    number: 6,
    name: "Not this time + refund",
    status: "manual",
    trigger: "Only if Callie issues a Stripe refund manually (auto-refunds disabled)",
    subject: "Depends on reason (congratulations / not yet)",
    audience: "Client",
    cta: null,
    bodyPreview: `Hi [First name],

Warm decline copy for the specific reason (first person, from me).

Your $149 has been fully refunded — it'll land back on your card in a few days.

If you left your email for the waitlist, I'll personally check in when the time is right.

Take care of yourself, mama.
Callie`,
  },
  {
    id: "callie_payment",
    number: "A",
    name: "Callie: new payment",
    status: "live",
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
    status: "live",
    trigger: "Intake submitted",
    subject: "✅ [name] finished intake — review + approve",
    audience: "Callie",
    cta: null,
    bodyPreview: `Headline stats (age, weight, breastfeeding, tastes, phone) + deep link to /admin. Flags pregnant / postpartum / diet for Callie 1:1 — no auto-deny.`,
  },
  {
    id: "callie_eligibility_hold",
    number: "B2",
    name: "Callie: eligibility hold",
    status: "retired",
    trigger: "Retired — intake no longer auto-denies; flags show on intake-ready email + admin",
    subject: "⚠️ [name] — pregnant / early nursing (no auto-refund)",
    audience: "Callie",
    cta: null,
    bodyPreview: `Legacy. Pregnant / postpartum now finish intake normally and flag in admin.`,
  },
  {
    id: "callie_refund",
    number: "C",
    name: "Callie: refund issued",
    status: "manual",
    trigger: "Legacy auto-refund path (disabled) — kept for historical email log",
    subject: "↩️ Refund: [name] ([reason]) — waitlisted",
    audience: "Callie",
    cta: null,
    bodyPreview: `Name, email, reason. Reminder they're on the waitlist if they left an email.`,
  },
];

export const EMAIL_TYPE_LABELS = {
  finish_joining_1h: "Finish joining (+1h)",
  finish_joining_24h: "Finish joining (+24h)",
  welcome: "Welcome",
  intake_reminder_24h: "Intake reminder (+24h)",
  intake_reminder_72h: "Intake reminder (+72h)",
  intake_received: "Intake received",
  macros_live: "Macros live",
  eligibility_refund: "Refund confirm",
  callie_payment: "Callie: new payment",
  callie_intake: "Callie: intake ready",
  callie_eligibility_hold: "Callie: eligibility hold",
  callie_refund: "Callie: refund",
};
