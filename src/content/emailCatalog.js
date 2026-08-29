/**
 * Read-only catalog of lifecycle emails for the admin UI.
 * Copy lives in Edge Functions for sending; this mirrors it for Callie to review.
 * Edits for early cohort: change functions + this catalog together (via Patrick → agent).
 *
 * Numbers match the email plan (#1–#6 client + Callie A/B/C).
 */

export const EMAIL_CATALOG = [
  {
    id: "finish_joining_1h",
    number: 1,
    name: "Finish joining · +1h",
    status: "live",
    trigger: "Track B — account created, still unpaid. +1 hour (hourly cron). Quiz-only leads with no profiles row never get this; they stay on the quiz drip until they create an account. $249 line only if this email has a quiz unlock. Prefills /join?email=. Unsubscribe footer + List-Unsubscribe.",
    subject: "Your spot's waiting, mama",
    audience: "Client",
    cta: "Finish signing up, lock in your spot",
    bodyPreview: `Hi [First name],

You started joining Macros and Mamas. I'm glad you're here.

When you're ready: macros I build myself, our group Mon through Fri, and a short Monday voice note to keep the week simple. We start Aug 31. Doors close Aug 27.

Finish signing up below to lock in your spot.

Your quiz rate is $249.

Want to split it? Checkout offers 4 interest-free payments of $62.25, about $31 a week.

Callie

(You're getting this because you started an account. Reply anytime. Unsubscribe in the footer. $249 line only when quiz unlock is true.)`,
  },
  {
    id: "finish_joining_24h",
    number: "1b",
    name: "Finish joining · +24h",
    status: "live",
    trigger: "Track B — unpaid profile, +24 hours after account create (hourly cron). Different body from +1h. Same $249 rule, prefilled join URL, and unsubscribe footer. Prefer this over +1h if both are due.",
    subject: "Your spot's waiting, mama",
    audience: "Client",
    cta: "Finish signing up, lock in your spot",
    bodyPreview: `Hi [First name],

Just checking in. I'd still love to have you in this group.

Inside: macros built by me, not a calculator. Our group Mon through Fri. A short Monday voice note to set the week.

We start Aug 31. Doors close Aug 27 so I can hand-build ranges before day one. Finish signing up when you're ready.

Your quiz rate is $249.

Want to split it? Checkout offers 4 interest-free payments of $62.25, about $31 a week.

Callie

(You're getting this because you started an account. Reply anytime. Unsubscribe in the footer. $249 line only when quiz unlock is true.)`,
  },
  {
    id: "finish_joining_close",
    number: "1c",
    name: "Finish joining · last note",
    status: "live",
    trigger: "Track B last unpaid note — one send on Wed Aug 26 PT for unpaid profiles who have not paid and have not already received this type. Then stop. Never sent on or after Aug 27 PT. Idempotent via email_events. Prefer this over +1h / +24h if both are due.",
    subject: "[First name], last note from me",
    audience: "Client",
    cta: "Finish signing up, lock in your spot",
    bodyPreview: `Hi [First name],

Last note from me. Doors close Aug 27. We start Monday.

If you still want in, finish signing up. If something's unclear, reply. I read everything.

Your quiz rate is $249.

Want to split it? Checkout offers 4 interest-free payments of $62.25, about $31 a week.

Callie

(Safe first name, fallback Mama. $249 line only when quiz unlock is true. Prefills /join?email=. Unsubscribe in the footer.)`,
  },
  {
    id: "welcome",
    number: 2,
    name: "Welcome",
    status: "live",
    trigger: "Right after Stripe payment succeeds, or when Callie marks complimentary in admin. Same email, sent once. Comp does not notify Callie of a payment.",
    subject: "You're in, mama 🤍 (here's what happens next)",
    audience: "Client",
    cta: "Complete my intake",
    bodyPreview: `Hi [First name],

Welcome to Macros and Mamas. I'm so glad you're here!

I want to tell you what makes this different, because you've probably tried the other way. This is not a 1,200-calorie plan. We don't crash, we don't punish, and we don't earn our food. We eat enough, we lift, and we lose fat while keeping the muscle that makes us strong enough for everything our lives ask of us. If you ever lose faster than about a pound to a pound and a half a week, I'll be the one telling you to eat more. That's the whole philosophy, and I mean it.

I also want to reinforce that tracking your macros and meals doesn't have to happen for perpetuity! I tracked for 8 weeks, lost 11 pounds, stopped tracking for 3 months (but still used everything I learned as my guide), and I have maintained that 11 pound weight loss! This system works! I was the guinea pig! And now I get to teach you!

Here's what happens next:

First, complete your intake. It takes about 3 minutes. That's where I learn your goals, your season of life, and even the foods you love. The moment you finish, I get to work.

Then your macros get built by me, not by a calculator. I personally review every mama's numbers before they go live. You'll get them within a day of finishing your intake, as flexible ranges, because real life doesn't happen in exact grams.

Once your macros are approved, you'll find me in Messages in the app, your group with the other mamas. That's where I live Monday through Friday. Voice notes, plate pics, wins, questions, all of it. Every Monday I drop a short voice note that sets the week's focus. Listen while you pump, nurse, walk, or hide in the pantry. No judgment!

While you're at it, do these two things, today if you can:
1. Take your before photos. Same outfit, same spot, same lighting. Front, side, and back. Your face doesn't need to be in them. You will not believe how much you'll want these in eight weeks!
2. Weigh yourself tomorrow morning, first thing, before coffee, before your morning hydration, and right after you pee! That's your starting point, and it's the last time that number gets to feel like a verdict. From here on, it's just data.

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

Your spot is paid for, but your numbers are waiting on you. 3 minutes and I'll get to work.

Finish your intake whenever you can; that's what I need before I build your ranges.

Callie

(72h follow-up adds: reply if anything's confusing. I read everything.)`,
  },
  {
    id: "intake_received",
    number: 4,
    name: "Intake received",
    status: "live",
    trigger: "Client finishes intake",
    subject: "Got it. I'm building your macros right now",
    audience: "Client",
    cta: "See my pending status",
    bodyPreview: `Hi [First name],

I have your intake. Thank you. I'm reviewing your numbers personally and you'll usually have them within a day.

When I approve, your dashboard unlocks and you can say hi in Messages. That's your group with me and the other mamas.

If your before photos and first weigh-in are still on the list, now's the moment.

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

I just finished your numbers. They're live in your dashboard right now, built from everything you told me. Remember: these are ranges, not rules. Active day, eat the top. Slow day, the bottom. Both count.

Join the mamas group. I'm in there Monday through Friday answering in voice notes. Open Messages in the app and come say hi so I can welcome you properly:
[Open Messages → /dashboard?tab=messages]

Your first 48 hours, and this is the whole assignment:
1. Today: log one meal. Tap it from your plan, snap it, or type it. Just one.
2. Tomorrow morning: log your weigh-in.
3. In the group: say hi. That's it.

One phone tip that makes this feel like an app: open macrosandmamas.com in Safari (iPhone) or Chrome (Android), tap Share, then Add to Home Screen. You'll get an icon on your phone. Tap it anytime and you're right back in your dashboard. No App Store needed.

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

Your payment has been fully refunded. It'll land back on your card in a few days.

If you left your email for the waitlist, I'll personally check in when the time is right.

Take care of yourself, mama.
Callie`,
  },
  {
    id: "cohort_open",
    number: "W",
    name: "Waitlist open (blast)",
    status: "ready",
    trigger: "Manual one-shot when enrollment reopens — POST /api/cohort-waitlist-blast (CRON_SECRET). Pulls cohort_waitlist; CTA → create account & pay.",
    subject: "Spots are open. Lock in your spot",
    audience: "Waitlist",
    cta: "Finish signing up. Lock in your spot",
    bodyPreview: `Hi [First name],

You asked to be first in line for the next Macros and Mamas group, and spots are open.

Create your account (or sign in), then finish checkout to lock in your spot. Inside: macros I build myself, our moms WhatsApp group Mon–Fri, and a short Monday voice note to keep the week simple.

Tap below when you're ready. I'd love to have you.

Callie

(You're getting this because you joined the waitlist. Reply to stop anytime.)`,
  },
  {
    id: "quiz_ranges",
    number: "Q",
    name: "Quiz ranges",
    status: "live",
    trigger: "Track A — ranges quiz completed. Immediate email (voice unchanged). Logged once to email_events as quiz_ranges so the drip can see #1. Re-quiz still re-sends this email; it does not restart the drip. A profiles row moves them to Track B (finish-joining) and stops the quiz drip.",
    subject: "Your ranges, [First name]",
    audience: "Lead",
    cta: "Lock my spot · $249",
    bodyPreview: `Hi [First name],

Here are your bands, built the same way Callie builds them for the program:
• Protein / Carbs / Fat / Calories

Your quiz also unlocked the $249 early rate ($50 off $299). The group starts Monday, Aug 31.

[Lock my spot · $249]

Want to split it? Checkout offers 4 interest-free payments of $62.25, about $31 a week.

These are bands, not one rigid number. Create your account and finish checkout to lock in your spot. Use this same email so your ranges stay attached.

If you join, Callie builds and approves your final numbers before you start.

Callie

(Reply anytime. Address footer on the branded template. Unsubscribe link in the footer.)`,
  },
  {
    id: "quiz_drip_2d",
    number: "Q2",
    name: "Quiz drip · day 2",
    status: "live",
    trigger: "Track A only — unpaid quiz lead, no profiles row, sales segment (main / early_pp_nurture). +2 days after quiz_ranges (hourly cron). Not a numbers dump; they already got their bands. Same join CTA. Stops if they create an account (finish-joining owns them), pay, unsubscribe, or land in pregnancy / plant-based.",
    subject: "[First name], the numbers are the easy part",
    audience: "Lead",
    cta: "Finish signing up, lock in your spot",
    bodyPreview: `Hi [First name],

The ranges I sent you are a starting point. They're not the whole program.

What we actually do together is the weekly check-in. Milk changes, sleep falls apart, appetite swings. That's when the numbers need a person, not a calculator.

This group starts Monday, Aug 31.

If you want that, finish signing up. Same email so your ranges stay attached. Your quiz rate is $249.

Want to split it? Checkout offers 4 interest-free payments of $62.25, about $31 a week.

Callie

(Reply anytime. Unsubscribe in the footer. Subject is distinct from "Your ranges" so Gmail does not thread this under the first email.)`,
  },
  {
    id: "quiz_drip_7d",
    number: "Q7",
    name: "Quiz drip · last",
    status: "live",
    trigger: "Track A last unpaid quiz-lead sales nudge — due on Wed Aug 26 PT after 8:00 AM, or at +6 days after quiz_ranges once that morning window is open, whichever comes first. Never sent on or after Aug 27 PT. Prefer last over +2d if both are due. Then stop. Never sent if a profiles row exists.",
    subject: "[First name], still want in?",
    audience: "Lead",
    cta: "Finish signing up, lock in your spot",
    bodyPreview: `Hi [First name],

A few days ago you took 90 seconds to answer some questions and got your macros back. Maybe you're still nursing and running on fumes. Maybe you're years past that stage, but somehow still last on your own list. Either way, I've looked at a lot of these questionnaires this week, and I keep seeing the same story: women who show up for everyone else, every single day, and quietly keep telling themselves "I'll get to me later."

I want to gently say something to you: later keeps not coming. And you deserve better than that.

Here's what I know after doing this work for years: timing is never going to feel perfect. There will always be a reason to wait: a sleep regression, a busy season at work, a kid who needs you at 2am. But your health isn't a reward you get after everything else is handled. It's the thing that lets you handle everything else.

Your macros were just the starting point. The real transformation happens inside Macros and Mamas, where you're not figuring this out alone at 11pm with fifteen browser tabs open. You'll have me in your corner, plus a whole cohort of women who get it, for accountability, for troubleshooting the hard weeks, for celebrating the wins that feel small but aren't.

The group starts Monday, Aug 31. Because you took the quiz, your spot is $249 (that's $50 off, already applied).

If you've been waiting for a sign that it's your turn, this is it.

[Lock my spot · $249]

I'd be so honored to walk this with you.

With love,
Callie

Want to split it? Checkout offers 4 interest-free payments of $62.25, about $31 a week.

(Reply anytime. Unsubscribe in the footer.)`,
  },
  {
    id: "quiz_one_more",
    number: "Q+",
    name: "Quiz · one more note",
    status: "manual",
    trigger: "Manual admin blast from Overview → Funnel. Unique quiz emails who submitted ranges and have not paid. Skips unsubscribed, pregnancy, and plant-based. Idempotent via email_events (quiz_one_more). CTA → /join. Does not change Terms or promise a refund.",
    subject: "One last time, [First name]",
    audience: "Lead",
    cta: "Lock my spot",
    bodyPreview: `Hi, [First name]!

One last time: you matter. Your health matters. I'd love to support you in making it a priority!

DMs are open, but course registration will close tonight.

www.macrosandmamas.com/join

With gratitude,
Callie

(First name from the quiz. Reply anytime. Unsubscribe in the footer. No money-back promise. Terms still say purchases are final except eligibility declines.)`,
  },
  {
    id: "quiz_pregnancy_note",
    number: "QP",
    name: "Quiz pregnancy note · day 3",
    status: "live",
    trigger: "Track A, pregnancy_nurture quiz leads only — one soft +3 day note. The first email promised a light note. No $249, no checkout CTA. Plant-based (waitlist_plantbased) gets no follow-up; the first email already said no hard sell. A profiles row stops this too.",
    subject: "[First name], whenever you're ready",
    audience: "Lead",
    cta: null,
    bodyPreview: `Hi [First name],

Just a light note, like I promised. Pregnancy is still an abundance season, not a cut. We're not sending ranges or a signup push.

When you're postpartum and ready, come back for your numbers. Until then, eat enough and rest when you can.

Reply anytime if you want to talk. No rush.

Callie

(Unsubscribe in the footer. No join button.)`,
  },
  {
    id: "callie_payment",
    number: "A",
    name: "Callie: new payment",
    status: "live",
    trigger: "Stripe payment succeeded",
    subject: "💰 New mama: [name] — paid $[amount]",
    audience: "Callie",
    cta: null,
    bodyPreview: `Plain-text alert with name, email, actual Stripe amount, referred-by when a code was used, and link to https://admin.macrosandmamas.com/admin.`,
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
    bodyPreview: `Headline stats (age, weight, breastfeeding, tastes, phone) + deep link to https://admin.macrosandmamas.com/admin. Flags pregnant / postpartum / diet for Callie 1:1 — no auto-deny.`,
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

/**
 * Customer-journey grouping for Admin → Emails → Templates.
 * Order is the path a mama walks. Callie notifies stay in their own group.
 */
export const EMAIL_JOURNEYS = [
  {
    id: "quiz",
    title: "Quiz, no account",
    track: "Track A",
    note: "Plant-based gets the first email only — no follow-up drip.",
    ids: ["quiz_ranges", "quiz_drip_2d", "quiz_drip_7d", "quiz_pregnancy_note"],
  },
  {
    id: "unpaid",
    title: "Signed up, no payment",
    track: "Track B",
    note: "+1 hour, +24 hours, then one last note on Wed Aug 26 PT. Tracks stay separate from the quiz drip.",
    ids: ["finish_joining_1h", "finish_joining_24h", "finish_joining_close"],
  },
  {
    id: "paid",
    title: "Paid",
    track: null,
    note: null,
    ids: ["welcome", "intake_reminder", "intake_received", "macros_live"],
  },
  {
    id: "other",
    title: "Other",
    track: null,
    note: "Waitlist open and the unpaid-ranges one-more note are manual blasts, not cron. Eligibility refund is only if Callie refunds in Stripe.",
    ids: ["eligibility_refund", "cohort_open", "quiz_one_more"],
  },
  {
    id: "callie",
    title: "Callie",
    track: "Operator",
    note: "These go to Callie, not to mamas. They are operator alerts, not the customer journey.",
    ids: ["callie_payment", "callie_intake", "callie_eligibility_hold", "callie_refund"],
  },
];

export function catalogByJourney(catalog = EMAIL_CATALOG) {
  const byId = new Map(catalog.map((row) => [row.id, row]));
  return EMAIL_JOURNEYS.map((journey) => ({
    ...journey,
    templates: journey.ids.map((id) => byId.get(id)).filter(Boolean),
  }));
}

export function catalogNumberLabel(row) {
  if (row == null) return "";
  return typeof row.number === "number" ? `#${row.number}` : String(row.number);
}

export const EMAIL_TYPE_LABELS = {
  finish_joining_1h: "Finish joining (+1h)",
  finish_joining_24h: "Finish joining (+24h)",
  finish_joining_close: "Finish joining (last note)",
  welcome: "Welcome",
  intake_reminder_24h: "Intake reminder (+24h)",
  intake_reminder_72h: "Intake reminder (+72h)",
  intake_received: "Intake received",
  macros_live: "Macros live",
  eligibility_refund: "Refund confirm",
  cohort_open: "Cohort open (waitlist)",
  quiz_ranges: "Quiz ranges",
  quiz_drip_2d: "Quiz drip (+2d)",
  quiz_drip_7d: "Quiz drip (last)",
  quiz_one_more: "Quiz one more note",
  quiz_pregnancy_note: "Quiz pregnancy note (+3d)",
  callie_payment: "Callie: new payment",
  callie_intake: "Callie: intake ready",
  callie_eligibility_hold: "Callie: eligibility hold",
  callie_refund: "Callie: refund",
  message: "Message email",
};
