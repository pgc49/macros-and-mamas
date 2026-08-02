# Macros and Mamas — Landing page design brief

**Audience:** Product / marketing designer (full creative freedom on layout and UX)  
**From:** Product owner + eng context (macrosandmamas.com)  
**Goal of this doc:** Give you enough truth about the brand, customer, offer, and product so you can **rethink the landing experience for conversion** — not inherit our current page structure.  
**Please do not** treat the live site or any prior mockups as the solution. Use them only as inventory of what exists today.

---

## 1. What we need from you

Design a **high-converting public homepage** (and, if useful, a paired waitlist page) for a small but serious coaching business that is about to scale with paid acquisition (Meta first, SEO later).

**Primary conversion (now):** Join the **cohort waitlist** and lock early pricing.  
**Secondary:** Returning members sign in.  
**Not the job of this page:** Teach every feature in equal depth, or replace the in-app onboarding.

Deliver what you normally would for a redesign: concept direction, homepage (mobile-first), key states/CTAs, and notes on how product proof (app UI) should appear. We will implement in code later (likely a static/Astro marketing surface separate from the logged-in app).

---

## 2. What Macros and Mamas is

**One line:** An 8-week postpartum-aware **macro coaching program** run by Callie — with a real phone app for logging and planning, plus Callie coaching in WhatsApp and in-app Messages.

**Business model:** Paid cohort program (not a free consumer app, not a marketplace). Women pay once for an 8-week container: human-built macro ranges, tools to live in those ranges, and access to Callie.

**Founder / coach:** Callie (Calista) — certified holistic nutritionist, blood chemistry certified, a mother. Brand presence is personal and first-person. The product is “Callie packaged,” not anonymous SaaS.

**Philosophy that must survive any redesign:**
- **“Ranges, not rules”** — flexible daily bands for calories and macros, not rigid single-number targets.
- Anti–crash-diet / anti–1,200-calorie culture. Muscle and milk supply matter. If someone loses faster than ~1–1.5 lb/week, the product tells them to **eat more**, not less.
- Real food families recognize — not proprietary shakes or a specialty shopping cult.
- Eight weeks of attention → years of plate intuition (not forever tracking).

**Hero line already in market (you may keep, evolve, or replace if conversion improves — explain why):**  
“Lose the weight. Keep the muscle. Eat like a mother.”

---

## 3. Brand system (constraints, not a layout)

### Colors (from product design tokens)

| Token | Hex | Role |
|--------|-----|------|
| Background | `#FAF5F2` | Page wash — warm, not clinical white |
| Ink | `#33272E` | Primary text |
| Ink soft | `#6E5D66` | Secondary text |
| Accent | `#B4416B` | Primary actions / brand pink |
| Accent deep | `#8E2F53` | Pressed / emphasis |
| Accent soft | `#F6E4EC` | Soft fills |
| Sage | `#5F8168` | Positive / “in range” moments |
| Sage soft | `#E6EFE8` | Soft positive fills |
| Amber | `#A9711F` | Warnings / attention (use sparingly on marketing) |
| Amber soft | `#F7ECD9` | Soft warning fills |
| Border | `#ECDEE2` | Hairlines |
| Card | `#FFFFFF` | Surfaces |

### Typography

- **Display / brand:** Marcellus (serif) — used for brand name and major headlines in-app  
- **UI / body:** Karla (sans)

Please use these or a tightly justified evolution. Avoid default “AI startup” stacks (Inter/Roboto) and generic purple gradients.

### Voice

- First-person Callie energy even when written in third person: warm, direct, mama-to-mama  
- Domestic and specific (pumping, pantry, freezer dinner, 4pm snack spiral) — not gym-bro or clinic brochure  
- Firm on standards (muscle, eating enough) without shame  
- Bad weeks are expected; Monday is a reset, not a moral failure  

### Imagery we already have

- Full-bleed lifestyle / Callie photos: `callie-hero.jpg`, `callie-about.jpg`  
- Social share image: `og-image.jpg`  
- App icons for PWA (not lifestyle marketing)  

**We do not yet have polished marketing screenshots of the app UI.** Plan for phone/product frames; we can supply real captures or production-quality mocks during implementation.

---

## 4. What the landing page shares today (inventory only)

Live site is a **React SPA** marketing route at `/` (same app shell as the product). Rough structure today:

1. **Full-bleed photo hero** with brand name, kicker “ranges, not rules,” headline, waitlist CTA, price note, “Already enrolled? Sign in”
2. **What’s inside** — six feature rows (emoji + title + body) focused heavily on WhatsApp, Monday voice note, human macros, meal plan/recipes, basic logging, progress
3. **Meet Callie** — photo + credentials + link out to her broader practice  
4. **FAQ** accordion  
5. Footer CTA repeat + Instagram + Terms/Privacy  

**Current primary CTA copy:** “Join the waitlist”  
**Current offer line:** Lock in **$249** ($50 off **$299**); email when spots open.  
**Founding rate ($149) is closed.**

### Why we’re redesigning (problem statement)

We believe the current page **undersells the product**. It reads like a WhatsApp coaching program with a tracker attached. In reality, members live in a capable home-screen app: AI plate + **restaurant menu** logging, week planning, groceries, water, habits, weigh-ins, in-app Messages + push, and Callie-published plans — *plus* WhatsApp.

We also need a page that can eventually be **indexable / ad-ready** (static HTML), while the logged-in product remains an app. That’s an implementation concern; your job is the **experience and persuasion**, not the framework.

---

## 5. Offer & funnel stage (conversion reality)

| Item | Current state |
|------|----------------|
| Enrollment | **Closed** to new checkout |
| Public goal | Grow **cohort 2 waitlist** |
| Waitlist price | **$249** early |
| Full price | **$299** |
| Founding | Closed at $149 |
| After waitlist | Email when open → create account → pay → short intake → Callie approves macros → app unlocks + WhatsApp invite |

**Conversion definition for this redesign:**  
Maximize qualified waitlist signups (email + name) who understand they’re joining a **paid 8-week coaching container**, not a free calorie app.

**Qualification matters:** We would rather attract women aligned with ranges/real food/Callie than maximize raw emails of people seeking a crash diet or pregnancy plan.

---

## 6. Ideal customer / ICP (no PII — from product, copy, and early cohort design)

### Core ICP

Women (often mothers) who want to **lose fat and keep or build muscle** without punishing themselves — especially those in a **postpartum or caregiving season**, but **not exclusively postpartum**.

**Strong fit signals:**
- Ready for a structured but humane 8 weeks  
- Open to tracking food for a season, then stopping  
- Breastfeeding **≥ ~3 months postpartum** (if nursing) — supply-aware coaching  
- Eat animal protein or pescatarian/vegetarian patterns the kitchen can support  
- Will use a **phone** (Add to Home Screen) and join a **private WhatsApp group** (numbers visible to other members — we disclose this)  
- Want a **human coach**, not only an algorithm  
- Life is noisy: kids, sleep debt, inconsistent workouts; they need flexibility and judgment-free resets  

**Intake dimensions we actually ask (shape of the member):**
- Weight now / goal weight (“where you feel your best”)  
- Pregnant? Breastfeeding? Months since birth?  
- Goal: lose fat / maintain / build strength  
- Activity: not much yet → walks + some workouts → very active  
- Stress level  
- Insulin resistance or PCOS (doctor-mentioned)  
- Diet style: no restrictions / pescatarian / vegetarian  
- Free-text loves for breakfast, lunch, dinner, snacks + “season of life” note for Callie  

### Who it is not for (must not be confused by the page)

- Currently **pregnant** (abundance season, not a cut)  
- **&lt;3 months postpartum while breastfeeding** (supply still establishing) — “not yet” positioning  
- Under 18  
- Active eating disorder without treating-provider clearance  
- Seeking a crash / starvation diet  
- Expecting a PDF-only program with no coaching access  
- Pure **vegan** kitchen (product playbook is animal-protein heavy; vegan is a poor fit)  

Public FAQ currently says you don’t have to be a mom or postpartum to join — brand still *feels* postpartum-first. Design should resolve that tension consciously (who we optimize creative for vs who we allow).

### Jobs-to-be-done (emotional + practical)

- “I want my body back without wrecking my milk or my mental health.”  
- “I need someone who gets mom life when the week blows up.”  
- “I don’t know how much to eat — calculators feel wrong.”  
- “I eat with my kids; I won’t cook separate ‘diet food.’”  
- “I want to learn what my plate looks like so I’m not tracking forever.”  

### Objections the page must handle (content, not necessarily FAQ-only)

1. Is this a crash diet?  
2. Can I breastfeed?  
3. Hidden product costs?  
4. How much Callie access?  
5. Do I need a gym?  
6. Do I have to track forever?  
7. What if I have a bad week?  
8. Is founding still open / what’s the price?  

### Tone of early members (qualitative, anonymized)

Early cohort is small (~tens of paying members). In aggregate they behave like **time-poor caregivers** who still show up for coaching when it’s in WhatsApp and on the home screen. They use photo logging, care about protein, ask practical plate questions, and need permission as much as macros. Design for **trust and clarity**, not growth-hack gimmicks.

---

## 7. What the product actually does (capabilities to sell truthfully)

Use this as the **truth catalog**. You choose hierarchy and which proofs appear on the homepage vs deeper pages.

### Coaching & human layer
- Callie personally reviews intake and **approves macro ranges** (calories, protein, carbs, fat as bands)  
- Private **WhatsApp group**, Callie Mon–Fri, often in **voice notes**; answers teach the whole group  
- **Monday voice note** — week focus / one skill / one thing to let go  
- **In-app Messages** (1:1 with Callie + announcements) with **push notifications** when the PWA is on the home screen  
- In-app Monday **voice drop** on the Today view (in addition to WhatsApp)

### Daily logging & AI
- Log via **Snap photo**, **Describe** (text), **My plan** recipes, or **manual macros**  
- **Snap → Menu**: photograph a restaurant menu → up to **5 ranked dish picks** for remaining room in the day → “I ordered this” to log  
- Refine a logged meal with another photo or note (“also had…”, portion context)  
- Ranges update as she logs; can log for past days  

### Planning & kitchen
- Week planner; AI **“Suggest my week”** grounded in tastes + recipe bank  
- **Grocery list** generated from the plan (check off / copy)  
- Pantry staples, **My meals**, paste-recipe AI estimates  
- ~21 high-protein recipes with quantities; meal “formulas” (protein anchor patterns)  
- Food preferences so plans adapt to what she actually eats  

### Habits & progress
- Checklist: macros, water + electrolytes, steps/walks, morning sunlight, meals at home, strength/sculpt  
- Dedicated **water** tracking (oz / bottle size)  
- Weigh-ins + charts; progress against ranges over time  
- Guardrail messaging if loss is too fast  

### Delivery / platform
- Mobile web app meant to be **Added to Home Screen** (looks/feels like an app; no App Store)  
- Tabs: Today, Meals, Progress, Messages  

### What we should stop over-indexing on
WhatsApp alone. It’s beloved and real — but it is **one channel**, not the whole product.

---

## 8. Competitive / category context (for positioning)

Women in this ICP bounce between:
- Generic calorie apps (MyFitnessPal energy) — high friction, low postpartum nuance  
- Instagram diet culture / 1200-cal coaches  
- Expensive 1:1 nutritionists without software  
- Free PDF meal plans that die in the Downloads folder  

**Our wedge:** human postpartum-aware coaching **plus** software that makes daily execution (logging, eating out, planning, groceries) realistic for a mother.

---

## 9. Design principles we care about (outcomes, not wireframes)

1. **Brand-first first screen** — “Macros and Mamas” should still feel like the brand if you covered the nav.  
2. **One job per section** — don’t dump every feature in the hero.  
3. **Show the product** — abstract lifestyle alone undersells; app reality converts skeptics who think this is “just a chat group.”  
4. **Mom cognitive load** — scannable, concrete benefits, short sentences; avoid dashboard-looking marketing.  
5. **Honesty about stage** — waitlist + price lock; don’t fake “enroll now” scarcity that isn’t real.  
6. **Trust** — Callie is the face; credentials matter, but warmth matters more.  
7. **Mobile-first** — most traffic will be Instagram / phone. Desktop can be elegant, not the priority.  

You have full freedom on composition, motion, photography direction, and how proof is staged — as long as the above truths hold.

---

## 10. Success criteria

A strong redesign should make a cold visitor able to answer in under a minute:
1. What is this?  
2. Who is it for / not for?  
3. What do I get for my money?  
4. Why is it different from a calorie app or a WhatsApp group alone?  
5. What do I do next, and what does $249 mean?  

And it should make a **qualified** woman feel: “This was built for my season — and there’s a real system, not just vibes.”

---

## 11. Out of scope for this brief

- Logged-in app UI redesign  
- Ad creative iterations (will follow once page direction is set)  
- Legal copy drafting (Terms/Privacy exist; link them)  
- Implementing Astro/engineering architecture  

---

## 12. Assets & references we’ll provide on request

- Current live URL: https://www.macrosandmamas.com/  
- Brand photos (hero / about / OG)  
- In-app screenshots once captured (Today, Menu picks, Plan + grocery, Messages)  
- Approved FAQ/feature strings if you want verbatim Callie voice in places  

---

## 13. Open questions for the designer (please recommend)

1. Should the homepage optimize creatively for **postpartum moms** as the face of the brand while FAQ keeps the door open to non-postpartum women — or narrow the public ICP?  
2. Waitlist-only: single page vs homepage + dedicated `/waitlist` landing for ads?  
3. How much Callie-personal story vs product-system proof in the first scroll?  
4. Best way to present AI features without sounding gimmicky or unsafe for a health-adjacent audience?  

---

*End of brief. Please start from the customer and the offer — not from the current site’s section list.*
