/** Privacy Policy — mirrored from launch legal copy. */
export const PRIVACY_EFFECTIVE_DATE = "August 13, 2026";

export const PRIVACY_INTRO = [
  'This Privacy Policy explains how C&C Health Coaching LLC ("we," "us," or "our") collects, uses, and shares information when you use the Macros and Mamas program, website (macrosandmamas.com), and web application (the "Program"). It is incorporated into our Terms and Conditions.',
  "Important: We are a wellness and education business, not a healthcare provider. Information you share with us is protected by this policy and applicable consumer privacy laws, not by HIPAA.",
];

export const PRIVACY_SECTIONS = [
  {
    title: "1. Information We Collect",
    body: [
      "Information you give us:",
      "Account information — name, email address, password, phone number.",
      "Health and body information — age, current weight, goal weight, pregnancy and breastfeeding status, months postpartum, activity level, stress level, health flags such as insulin resistance, and food preferences. We collect this to calculate your macro targets.",
      "Program activity — meal logs, meal photos and descriptions, weekly weigh-ins, and habit checklist entries.",
      "Communications — messages you send us by email or in the group chat, and any testimonials or progress photos you choose to share with us.",
      "Information collected automatically:",
      "Basic technical and usage data such as IP address, browser and device type, pages viewed, and timestamps, used to operate and secure the site. We may use Cloudflare Web Analytics for aggregate site traffic (pageviews by path); that product is designed not to use cookies for analytics and does not give us a per-visitor identity in our database. We may also use Google Analytics 4 (via the Google tag / gtag.js, and optionally Google Tag Manager) on public marketing and enrollment pages. Google Analytics uses cookies and similar identifiers to measure visits, sources, and conversion events; it is not loaded on signed-in coaching tabs.",
      "Marketing attribution — when you arrive from a campaign link (for example with UTM parameters) or a Meta ad, we may store those parameters in your browser and, if you create an account, attach first-touch source fields to your profile so we can understand which channels lead to signups. A first-party browser identifier may be stored locally and linked to your profile at signup; we do not store anonymous pageview rows for visitors who never create an account.",
      "Ranges quiz / lead magnet — if you use the free ranges quiz, we collect your name, email, and quiz answers (for example height, weight, feeding status, postpartum timing, goals, and optional health flags such as thyroid or blood sugar). We use this to calculate or personally review your macro ranges, email your results, and follow up about the Program. Baby's birthday may be collected for early-postpartum timing reminders. Health-adjacent quiz answers are not sent to Meta advertising tools or to Google Analytics.",
      "Advertising measurement data — when you arrive from a Meta (Facebook/Instagram) ad, a Google ad, or interact with a tracked conversion (for example joining the waitlist, completing the ranges quiz, or completing checkout), we may collect advertising cookie identifiers (_fbp / _fbc, Google Analytics cookies such as _ga), click IDs (fbclid, gclid), and UTM campaign parameters, and we may hash your email and phone for Meta ads measurement. See Section 4.",
      "Information we do not collect: we never see or store your full payment card details. Payments are processed by Stripe.",
    ],
  },
  {
    title: "2. How We Use Your Information",
    body: [
      "We use your information to:",
      "calculate, review, and deliver your personalized macro ranges;",
      "provide the app, including logging, tracking, and progress features;",
      "estimate macros from the meal photos and descriptions you submit;",
      "send program emails (welcome, intake reminders, approval, check-ins, graduation) and coach communications;",
      "invite you to and administer the private group chat;",
      "process payments and, where applicable, refunds;",
      "deliver free ranges quiz results by email and related Program follow-ups;",
      "measure and improve advertising and site performance (for example, whether a waitlist signup, quiz lead, or purchase came from a Meta or Google campaign) using Meta Pixel and Conversions API, and Google Analytics 4 / the Google tag — without sending health-adjacent quiz answers to Meta or Google;",
      "improve the Program and troubleshoot problems;",
      "comply with legal obligations and enforce our Terms.",
      "We do not sell your personal information for money. We may share limited information with Meta for advertising measurement and with Google for analytics as described in Section 4.",
    ],
  },
  {
    title: "3. Meal Photos and AI Processing",
    body: [
      "When you submit a meal photo or a text description for a macro estimate, that content is sent to a third-party AI provider solely to generate the estimate and return it to you. Do not include other people, documents, or background details you would not want processed. You can always use manual entry or preset recipes instead of photos.",
    ],
  },
  {
    title: "4. How We Share Information",
    body: [
      "We share information only with service providers who help us run the Program, and only as needed for them to do so:",
      "Stripe — payment processing",
      "Supabase — database and account authentication",
      "Cloudflare — website hosting, delivery, and optional Web Analytics (aggregate traffic)",
      "Google LLC — Google Analytics 4 and the Google tag (and Google Tag Manager if enabled) on public marketing and enrollment pages. Data may include IP address (we request IP anonymization), device and browser type, pages viewed, referring URLs, UTM parameters, click IDs (gclid), and conversion events such as generate_lead, begin_checkout, and purchase. Google may also set cookies. Google processes this data under its own terms and privacy policy.",
      "Resend — email delivery",
      "AI provider(s) — meal photo and description estimates",
      "WhatsApp (Meta) — group communication",
      "Meta Platforms, Inc. — advertising measurement via Meta Pixel (browser) and Conversions API (server). Data may include hashed email and phone, IP address, user agent, cookie identifiers (_fbp / _fbc), click IDs, and event details such as Lead, InitiateCheckout, and Purchase. Meta uses this to measure ad performance and may use it under Meta's own policies. This is a \"share\" for cross-context behavioral advertising measurement under CCPA/CPRA language.",
      "We may also disclose information if required by law or legal process, to protect our rights or someone's safety, or in connection with a sale or reorganization of our business.",
      "A note on the group chat: the private WhatsApp group is operated by Meta under its own terms and privacy policy. Other members of the group can see your phone number and anything you post there. Please share only what you're comfortable sharing with the group.",
    ],
  },
  {
    title: "5. Testimonials and Photos",
    body: [
      "Progress photos you take for your own tracking are yours and are not shared by us. If you choose to send us a testimonial, review, or progress photo, we may use it in marketing as described in our Terms — and we will not use images showing your face without your separate express consent. You can ask us to stop using your content in future marketing at any time by emailing us.",
    ],
  },
  {
    title: "6. How Long We Keep Information",
    body: [
      "We keep your account and program information for as long as your account is active and for up to three years afterward, so we can answer questions about your participation and meet legal and tax obligations. You can ask us to delete your information sooner (see Section 8). Some records, such as payment and tax records, must be retained longer by law.",
    ],
  },
  {
    title: "7. Security",
    body: [
      "We protect your information with encryption in transit, access controls, and database rules that limit each client's data to her own account. No system is perfectly secure, but we take this seriously — particularly because the information you share with us is personal.",
    ],
  },
  {
    title: "8. Your Rights and Choices",
    body: [
      "You may:",
      "access the personal information we hold about you;",
      "correct inaccurate information (much of it is editable in the app);",
      "delete your account and associated information;",
      "opt out of marketing emails using the unsubscribe link — note that transactional emails about your active program will still be sent;",
      "leave the group chat at any time.",
      "If you are a California resident, the CCPA/CPRA gives you rights to know what personal information we collect, to request deletion or correction, to opt out of the \"sale\" or \"sharing\" of personal information for cross-context behavioral advertising, and not to be discriminated against for exercising those rights.",
      "We do not sell personal information for money. We share limited data with Meta for advertising measurement (Pixel / Conversions API) and with Google for analytics (Google Analytics 4 / Google tag) as described in Section 4. To opt out of that sharing, email calista@nourishwithcalista.com with the subject \"Do Not Share My Info\" and we will honor your request as required by law. You may also use browser or platform controls (for example Meta ad settings, Google Ads Settings, or an analytics opt-out add-on) to limit ad tracking.",
      "To make a request, email calista@nourishwithcalista.com. We will verify your identity and respond within the timeframe required by law.",
    ],
  },
  {
    title: "9. Children",
    body: [
      "The Program is for adults 18 and older. We do not knowingly collect information from children. If you believe a minor has given us information, contact us and we will delete it.",
    ],
  },
  {
    title: "10. Changes to This Policy",
    body: [
      "We may update this policy. Material changes will be posted here with a new effective date, and where required we will notify you directly.",
    ],
  },
  {
    title: "11. Contact Us",
    body: [
      "C&C Health Coaching LLC",
      "2108 N St, Ste N",
      "Sacramento, CA 95816-5712",
      "calista@nourishwithcalista.com",
    ],
  },
];
