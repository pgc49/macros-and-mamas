/* ==================================================================
   MACROS AND MAMAS — production source (from Callie's approved prototype)
   ==================================================================
   This file is the product spec + client app. Everything marked
   PROD-TODO is a seam the build agent must wire before deploy.
   Grep for "PROD-TODO" and "{{...}}" tokens to find every placeholder.

   REMOVED from the prototype (artifact-only scaffolding):
     - window.storage persistence  -> replaced by the `db` data layer below
     - keyless Anthropic API call  -> replaced by POST to /api/analyze
                                      (see functions/api/analyze.js)
     - MOCK_CLIENTS sample roster  -> roster now loads from the database
     - "Dolly" demo button + seeded demo history
     - client-side "Callie's view" toggle -> replaced by role-based auth
     - "reset prototype" button
     - all "prototype only" copy

   PRESERVE VERBATIM (Callie has approved all of this):
     - computeMacros() formula, floors, caps, and every note string
     - intake gating rules in submitIntake()
     - all sales, intake, decline, pending, and app copy
     - SKELETONS, RECIPES, DEFAULT_ITEMS, FEATURES content
     - RangeBand design and the 1.5 lb/wk guardrail messaging
   ================================================================== */

import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  PROD-TODO: CONFIG — every external dependency lives here.          */
/*  Replace each {{PLACEHOLDER}} before launch.                        */
/* ------------------------------------------------------------------ */
const CONFIG = {
  // PROD-TODO(stripe): One product, $149 founding price.
  // Option A (ships fastest): a plain Stripe Payment Link pasted here.
  // Option B (do it right): a Checkout Session created by a Pages
  // Function + webhook that provisions the Supabase account.
  // SEQUENCING DECISION REQUIRED: the intake gates DECLINE some
  // applicants (pregnant, <6mo postpartum breastfeeding, veg/vegan).
  // Either run intake BEFORE payment (recommended — no refunds needed)
  // or charge first and refund declines. Current UI assumes
  // intake -> Callie approves -> payment link sent.
  STRIPE_PAYMENT_LINK: "{{STRIPE_PAYMENT_LINK_URL}}",

  // PROD-TODO(api): Cloudflare Pages Function endpoint that proxies
  // the meal photo to the Anthropic Messages API. The ANTHROPIC_API_KEY
  // lives ONLY as a Cloudflare secret on the server — never here.
  ANALYZE_ENDPOINT: "/api/analyze",

  // PROD-TODO(supabase): project URL + anon (publishable) key.
  // The anon key is safe client-side ONLY with row-level security on
  // every table. Service-role key never ships to the client.
  SUPABASE_URL: "{{SUPABASE_PROJECT_URL}}",
  SUPABASE_ANON_KEY: "{{SUPABASE_ANON_KEY}}",

  // PROD-TODO(whatsapp): Callie invites each mama personally by text
  // after approval, so this may stay a no-op. If a group invite link
  // is ever used instead, it goes here.
  WHATSAPP_GROUP_URL: "{{WHATSAPP_GROUP_INVITE_URL}}",

  // PROD-TODO(fullscript): Callie's practitioner links.
  FULLSCRIPT_ELECTROLYTES: "{{FULLSCRIPT_ELECTROLYTES_URL}}",
  FULLSCRIPT_SLEEP: "{{FULLSCRIPT_SLEEP_URL}}",
  FULLSCRIPT_DIGESTION: "{{FULLSCRIPT_DIGESTION_URL}}",
};

/* ------------------------------------------------------------------ */
/*  PROD-TODO: AUTH — replace this stub with Supabase Auth.            */
/*  Requirements:                                                      */
/*   - email magic-link or password auth for clients                   */
/*   - Callie's account carries an `admin` role (profiles.role)        */
/*   - isAdmin unlocks the admin portal below; RLS enforces it         */
/*     server-side too (never trust this flag alone)                   */
/* ------------------------------------------------------------------ */
function useAuth() {
  // PROD-TODO(auth): wire to supabase.auth.getSession() / onAuthStateChange
  return { user: null, isAdmin: false, signOut: () => {} };
}

/* ------------------------------------------------------------------ */
/*  PROD-TODO: DATA LAYER — replaces every window.storage call.        */
/*  Suggested Supabase tables (RLS on all):                            */
/*    profiles  (intake fields incl. tastes + phone, role)             */
/*    macros    (cal/protein/fat/carbs/notes, approved flag)           */
/*    checkins  (week_start, item_id, day)                             */
/*    weighins  (date, weight)                                         */
/*    meal_logs (date, name, cal, p, c, f)                             */
/* ------------------------------------------------------------------ */
const db = {
  // PROD-TODO(db): load the signed-in client's full state
  async loadClientState() { return null; },
  // PROD-TODO(db): persist client state (split writes per table; do
  // NOT blob the whole state into one row like the prototype did)
  async saveClientState(_state) {},
  // PROD-TODO(db): write the completed intake -> profiles + macros
  // rows with approved=false; this is what puts a mama in Callie's
  // pending queue
  async submitIntake(_profile, _macros) {},
  // PROD-TODO(db): admin only — full roster with status/adherence/weighins
  async loadRoster() { return []; },
  // PROD-TODO(db): admin only — update a client's macro numbers
  async updateClientMacros(_clientId, _macros) {},
  // PROD-TODO(db): admin only — set approved=true, week=1; also
  // triggers Callie's manual WhatsApp invite text
  async approveClient(_clientId) {},
};

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/* ------------------------------------------------------------------ */
const T = {
  bg: "#FAF5F2",
  ink: "#33272E",
  inkSoft: "#6E5D66",
  accent: "#B4416B",
  accentDeep: "#8E2F53",
  accentSoft: "#F6E4EC",
  sage: "#5F8168",
  sageSoft: "#E6EFE8",
  amber: "#A9711F",
  amberSoft: "#F7ECD9",
  card: "#FFFFFF",
  border: "#ECDEE2",
  track: "#F1E7EA",
};
const F = "'Karla', sans-serif";
const FD = "'Marcellus', serif";

const Fonts = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Marcellus&family=Karla:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; }
    input, select, button, textarea { font-family: ${F}; }
    input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  `}</style>
);

/* ------------------------------------------------------------------ */
/*  Callie's macro engine — PRESERVE VERBATIM                          */
/* ------------------------------------------------------------------ */
const round5 = (n) => Math.round(n / 5) * 5;

function computeMacros(p) {
  const gw = Number(p.goalWeight);
  let mult = p.goal === "gain" ? 15 : p.goal === "maintain" ? 13.5 : 12;
  let notes = [];

  if (p.breastfeeding && p.goal === "lose") {
    mult = 13;
    notes.push("Breastfeeding: calories set gentler (×13 instead of ×12) to protect supply.");
  }

  let cal = Math.round(gw * mult);

  const floor = p.breastfeeding ? 1800 : 1400;
  if (cal < floor) {
    cal = floor;
    notes.push(`Raised to the ${floor} calorie floor — going lower risks ${p.breastfeeding ? "milk supply and " : ""}muscle loss.`);
  }

  const protein = round5(0.9 * gw);
  const fat = round5(0.4 * gw);
  let carbs = round5((cal - protein * 4 - fat * 9) / 4);

  if (p.insulinResistance && carbs > 100) {
    carbs = 100;
    cal = protein * 4 + fat * 9 + carbs * 4;
    notes.push("Insulin resistance flagged: carbs capped at 100g (Callie's fat-loss shortcut).");
  }
  if (carbs < 100 && p.breastfeeding) {
    carbs = 100;
    cal = protein * 4 + fat * 9 + carbs * 4;
    notes.push("Carbs raised to 100g minimum while breastfeeding.");
  }

  return { cal, protein, fat, carbs, notes };
}

/* ------------------------------------------------------------------ */
/*  Content — PRESERVE VERBATIM                                        */
/* ------------------------------------------------------------------ */
const SKELETONS = [
  {
    meal: "Breakfast",
    formula: "Protein anchor + fruit or oats",
    lines: [
      "Protein smoothie (protein powder + fruit + greens)",
      "Protein oatmeal (oats + protein powder stirred in)",
      "Chicken sausage + 1 egg + egg whites",
    ],
  },
  {
    meal: "Lunch",
    formula: "Protein salad, or protein on sourdough",
    lines: [
      "Chicken salad / tuna salad on greens",
      "Protein + sourdough open-face",
      "Leftover dinner protein over a big salad",
    ],
  },
  {
    meal: "Dinner",
    formula: "Animal protein + vegetable + rice or starchy carb",
    lines: [
      "Chicken, salmon, halibut, or turkey",
      "One roasted or sautéed vegetable",
      "Rice, potatoes, or sweet potato",
    ],
  },
];

const RECIPES = [
  { cat: "Breakfast", name: "Protein oatmeal", desc: "½ cup (40g) dry oats cooked in water, 1 scoop (30g) vanilla protein stirred in, ⅔ cup (100g) berries, cinnamon.", cal: 310, p: 30, c: 40, f: 4, serves: 1 },
  { cat: "Breakfast", name: "Berry protein smoothie", desc: "1 scoop (30g) protein, 1 cup (140g) frozen berries, ½ medium banana, 1 cup spinach, 1 cup unsweetened almond milk.", cal: 270, p: 28, c: 34, f: 4, serves: 1 },
  { cat: "Breakfast", name: "Sausage, egg + whites", desc: "2 chicken breakfast sausage links, 1 large egg + ½ cup (120g) egg whites, 1 slice (2 oz) sourdough.", cal: 420, p: 36, c: 29, f: 14, serves: 1 },
  { cat: "Breakfast", name: "Greek yogurt bowl", desc: "1 cup (227g) nonfat Greek yogurt, 1 tbsp honey, ¼ cup (28g) granola, ½ cup (75g) berries.", cal: 350, p: 25, c: 49, f: 5, serves: 1 },
  { cat: "Breakfast", name: "Egg white veggie scramble", desc: "1 large egg + ¾ cup (180g) egg whites, ½ cup peppers + 1 cup spinach, 2 chicken breakfast sausage links, 1 small orange.", cal: 400, p: 39, c: 25, f: 13, serves: 1 },
  { cat: "Breakfast", name: "Cottage cheese + peach", desc: "1 cup (226g) 2% cottage cheese, 1 medium peach, 1 tsp honey, 1 tbsp (10g) hemp seeds.", cal: 320, p: 28, c: 30, f: 10, serves: 1 },
  { cat: "Breakfast", name: "Protein pancakes", desc: "½ cup (40g) dry oats blended, 1 large egg, 1 scoop (30g) vanilla protein, ¼ cup (60g) unsweetened applesauce, ½ tsp baking powder. Top with 1 tbsp maple syrup.", cal: 410, p: 36, c: 49, f: 9, serves: 1 },
  { cat: "Lunch", name: "Chicken salad on sourdough", desc: "5 oz (140g) shredded cooked chicken breast, 3 tbsp (45g) nonfat Greek yogurt, 1 tsp Dijon, ¼ cup diced celery, on 1 slice (2 oz) toasted sourdough.", cal: 410, p: 53, c: 30, f: 6, serves: 1 },
  { cat: "Lunch", name: "Tuna salad lettuce wraps", desc: "1 can (5 oz) wild tuna in water, drained, 3 tbsp (45g) nonfat Greek yogurt, fresh dill + lemon, 6 butter lettuce cups, 1 medium apple.", cal: 245, p: 31, c: 28, f: 2, serves: 1 },
  { cat: "Lunch", name: "Grilled chicken big salad", desc: "6 oz (170g) grilled chicken breast, 3 cups romaine, ½ cup cucumber, ½ cup cherry tomatoes, 2 tbsp (10g) shaved parmesan, 2 tbsp light vinaigrette.", cal: 420, p: 59, c: 10, f: 14, serves: 1 },
  { cat: "Lunch", name: "Turkey sausage rice bowl", desc: "2 turkey sausage links, sliced, 1 cup (158g) cooked rice, 1 cup zucchini + ½ cup bell pepper sautéed with olive oil spray.", cal: 480, p: 32, c: 58, f: 12, serves: 1 },
  { cat: "Lunch", name: "Salmon salad bowl", desc: "5 oz (140g) leftover cooked wild salmon, 3 cups mixed greens, ½ cup cucumber, ¼ avocado, big lemon squeeze — no oil needed with the avocado.", cal: 335, p: 39, c: 6, f: 15, serves: 1 },
  { cat: "Lunch", name: "Pulled chicken + slaw bowl", desc: "5 oz (140g) pulled chicken breast, ¾ cup (119g) cooked rice, 1½ cups shredded cabbage tossed with lime + 2 tbsp (30g) nonfat Greek yogurt.", cal: 435, p: 51, c: 42, f: 5, serves: 1 },
  { cat: "Lunch", name: "Chicken quinoa jar salad", desc: "4 oz (113g) cooked chicken breast, ½ cup (92g) cooked quinoa, ¼ cup (41g) chickpeas, ½ cup cherry tomatoes, 2 tbsp (28g) crumbled feta, 1 tbsp light vinaigrette. Prep 3 at once.", cal: 460, p: 45, c: 33, f: 15, serves: 1 },
  { cat: "Dinner", name: "Callie's chicken teriyaki", desc: "1½ lbs boneless skinless chicken thighs; glaze: 3 tbsp honey + ¼ cup tamari + garlic and ginger. Per serving: 6 oz raw thighs with ¼ of glaze, 1 cup (158g) cooked rice, 1 cup steamed broccoli.", cal: 540, p: 38, c: 64, f: 13, serves: 4 },
  { cat: "Dinner", name: "Salmon + potatoes", desc: "Two 6 oz (170g) wild salmon fillets. Per serving: 1 fillet, 6 oz (170g) roasted baby potatoes, 6 asparagus spears, 1 tsp olive oil, lemon.", cal: 455, p: 43, c: 32, f: 16, serves: 2 },
  { cat: "Dinner", name: "Halibut + rice", desc: "Two 6 oz (170g) halibut fillets, pan-seared. Per serving: 1 fillet with 1 tsp garlic butter, 1 cup (158g) cooked rice, 1 cup zucchini sautéed with olive oil spray.", cal: 455, p: 44, c: 50, f: 7, serves: 2 },
  { cat: "Dinner", name: "Pulled chicken tacos", desc: "1½ lbs chicken breast slow-cooked in 1 cup salsa. Per serving: 5 oz (140g) chicken, 3 corn tortillas, ¾ cup cabbage slaw with lime, ¼ cup salsa.", cal: 425, p: 48, c: 38, f: 7, serves: 4 },
  { cat: "Dinner", name: "Turkey meatballs + rice", desc: "1 lb 99% lean ground turkey + 1 egg + ¼ cup (28g) breadcrumbs = 12 meatballs. Per serving: 3 meatballs, ½ cup marinara, 1 cup (158g) cooked rice, 1 cup green beans.", cal: 470, p: 36, c: 67, f: 6, serves: 4 },
  { cat: "Dinner", name: "Sheet pan chicken", desc: "1½ lbs chicken breast. Per serving: 6 oz (170g) raw chicken, 1 cup (133g) cubed sweet potato, 1 cup brussels sprouts, 2 tsp olive oil + herbs, roasted at 425°F for 25 min.", cal: 440, p: 45, c: 35, f: 14, serves: 4 },
  { cat: "Dinner", name: "Ground turkey stir fry", desc: "1 lb 93% lean ground turkey, 4 cups frozen stir-fry vegetables; sauce: 3 tbsp coconut aminos + 1 tbsp honey + garlic. Per serving: ¼ of skillet with 1 cup (158g) cooked rice.", cal: 460, p: 28, c: 59, f: 10, serves: 4 },
];

const DEFAULT_ITEMS = [
  { id: "macros", label: "Hit my macro ranges", daily: true },
  { id: "water", label: "Water goal + electrolytes", daily: true },
  { id: "steps", label: "8k+ steps or two walks", daily: true },
  { id: "sun", label: "Morning sunlight", daily: true },
  { id: "home", label: "Ate my meals at home", daily: true },
  { id: "strength", label: "Strength / sculpt workout", daily: false },
];
const DAYS = ["M", "T", "W", "T2", "F", "S", "S2"];
const DAY_LABEL = { M: "M", T: "T", W: "W", T2: "T", F: "F", S: "S", S2: "S" };

/* ---- date + rate helpers (used by client app and admin portal) ---- */
const wkStartOf = (d = new Date()) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday start
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
};
const addDaysIso = (iso, n) => new Date(new Date(iso + "T12:00:00").getTime() + n * 86400000).toISOString().slice(0, 10);
const fmtRange = (wk) => {
  const f = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(wk)} – ${f(addDaysIso(wk, 6))}`;
};
const rateOf = (arr) => {
  if (!arr || arr.length < 2) return null;
  const first = arr[0], last = arr[arr.length - 1];
  const days = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (days < 5) return null;
  return ((first.w - last.w) / days) * 7;
};

const FEATURES = [
  { icon: "💬", title: "Callie in your pocket, Mon–Fri", body: "A private WhatsApp group with Callie and your fellow mamas. Ask anything — she answers in voice notes throughout the week, and every answer teaches the whole group." },
  { icon: "🎙️", title: "A Monday voice note from Callie", body: "Every week opens with a short voice note: the week's focus, one skill to practice, one thing to let go of. Listen while you pump, walk, or hide in the pantry." },
  { icon: "🎯", title: "Macros built for you, by a human", body: "Not a generic calculator. You fill out a real intake, and Callie personally reviews and approves your numbers — as flexible ranges, never rigid targets." },
  { icon: "🍳", title: "A meal plan that tastes like you", body: "Simple meal formulas plus 21 high-protein recipes with exact quantities and every macro counted. Then tell Callie what you love to eat, and get recipes adapted to your tastes — high-protein versions of your favorites." },
  { icon: "✅", title: "A weekly rhythm you can keep", body: "One movable checklist: macros, water + electrolytes, 8k+ steps or two walks, morning sunlight, and three strength workouts on the days you choose." },
  { icon: "📈", title: "Progress that protects your muscle", body: "Weekly weigh-ins with a built-in guardrail: lose faster than 1.5 lbs a week and we tell you to eat more, not less." },
];

/* ------------------------------------------------------------------ */
/*  Building blocks (defined OUTSIDE the app so inputs keep focus)     */
/* ------------------------------------------------------------------ */
const Card = ({ children, style }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18, ...style }}>{children}</div>
);

const Btn = ({ children, onClick, ghost, small, style, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      fontFamily: F, fontWeight: 700, fontSize: small ? 13 : 15, cursor: disabled ? "default" : "pointer",
      padding: small ? "8px 14px" : "13px 22px", borderRadius: 999,
      border: ghost ? `1.5px solid ${T.accent}` : "none",
      background: ghost ? "transparent" : disabled ? "#D9C4CE" : T.accent,
      color: ghost ? T.accent : "#fff",
      ...style,
    }}
  >{children}</button>
);

const Field = ({ label, children }) => (
  <label style={{ display: "block", marginBottom: 14 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, marginBottom: 6, letterSpacing: 0.2 }}>{label}</div>
    {children}
  </label>
);

const inputStyle = {
  width: "100%", padding: "12px 14px", fontSize: 16, border: `1.5px solid ${T.border}`,
  borderRadius: 12, background: "#fff", color: T.ink,
};

const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    padding: "10px 16px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer",
    border: `1.5px solid ${active ? T.accent : T.border}`,
    background: active ? T.accentSoft : "#fff", color: active ? T.accentDeep : T.inkSoft,
  }}>{children}</button>
);

const RangeBand = ({ label, lo, hi, unit = "g", color = T.accent, soft = T.accentSoft, eaten }) => {
  const start = 22, width = 56;
  let dot = null;
  if (typeof eaten === "number" && eaten > 0) {
    const pos = eaten <= lo ? (eaten / lo) * start : start + Math.min((eaten - lo) / (hi - lo), 1.35) * width;
    dot = Math.min(pos, 96);
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: FD, fontSize: 26, color: T.ink }}>
          {lo}<span style={{ color: T.inkSoft, fontSize: 20 }}>–</span>{hi}<span style={{ fontSize: 15, color: T.inkSoft }}> {unit}</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 10, background: T.track, borderRadius: 999, marginTop: 6 }}>
        <div style={{ position: "absolute", left: `${start}%`, width: `${width}%`, top: 0, bottom: 0, background: soft, border: `1.5px solid ${color}`, borderRadius: 999 }} />
        <div style={{ position: "absolute", left: `${start}%`, top: -3, width: 3, height: 16, background: color, borderRadius: 2 }} />
        <div style={{ position: "absolute", left: `${start + width}%`, top: -3, width: 3, height: 16, background: color, borderRadius: 2 }} />
        {dot !== null && (
          <div style={{ position: "absolute", left: `${dot}%`, top: -5, width: 14, height: 20, background: T.ink, borderRadius: 6, border: "2.5px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)", transform: "translateX(-50%)" }} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkSoft, marginTop: 4 }}>
        <span>slower day → aim low</span>
        {typeof eaten === "number" && eaten > 0 ? <span style={{ fontWeight: 700, color: T.ink }}>logged: {Math.round(eaten)}{unit}</span> : <span>active day → aim high</span>}
      </div>
    </div>
  );
};

/* Shell — prototype's coach toggle and reset button removed.
   PROD-TODO(auth): add a signed-in indicator / sign-out control here
   once Supabase Auth is wired. */
const Shell = ({ children }) => (
  <div style={{ fontFamily: F, background: T.bg, minHeight: "100vh", color: T.ink }}>
    <Fonts />
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 90px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 2px 6px" }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: 24, letterSpacing: 0.3 }}>Macros and Mamas</div>
          <div style={{ fontSize: 12, color: T.accentDeep, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>ranges, not rules</div>
        </div>
      </header>
      {children}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Main app                                                           */
/* ------------------------------------------------------------------ */
export default function MacrosAndMamas() {
  const { isAdmin } = useAuth(); // replaces the prototype's client-side coach toggle
  const [view, setView] = useState("sales"); // sales | intake | declined | pending | app
  const [tab, setTab] = useState("today");
  const [step, setStep] = useState(0);
  const [declineReason, setDeclineReason] = useState("");
  const [profile, setProfile] = useState({
    name: "", age: "", phone: "", currentWeight: "", goalWeight: "", monthsPP: "",
    breastfeeding: null, pregnant: null, goal: "lose", activity: "moderate",
    stress: "medium", insulinResistance: false, diet: "none",
    prefB: "", prefL: "", prefD: "",
  });
  const [macros, setMacros] = useState(null);
  const [approved, setApproved] = useState(false);
  const curWk = wkStartOf();
  const [checksByWeek, setChecksByWeek] = useState({});
  const [strengthByWeek, setStrengthByWeek] = useState({ [curWk]: ["M", "W", "F"] });
  const [viewWk, setViewWk] = useState(curWk);
  const [editPast, setEditPast] = useState(false);
  const [weighins, setWeighins] = useState([]);
  const [wInput, setWInput] = useState("");
  const [mealFilter, setMealFilter] = useState("All");
  const [roster, setRoster] = useState([]); // prototype's MOCK_CLIENTS removed — loads from db
  const [adminSel, setAdminSel] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoResult, setPhotoResult] = useState(null);
  const [todayLog, setTodayLog] = useState({ date: new Date().toISOString().slice(0, 10), entries: [] });
  const [loaded, setLoaded] = useState(false);

  /* PROD-TODO(db): initial load — replaces window.storage.get.
     For a signed-in client: hydrate profile, macros, approved,
     checksByWeek, strengthByWeek, weighins, todayLog from Supabase.
     For Callie (isAdmin): hydrate the roster. */
  useEffect(() => {
    (async () => {
      try {
        const s = await db.loadClientState();
        if (s) {
          if (s.profile) setProfile(s.profile);
          if (s.macros) setMacros(s.macros);
          if (s.view) setView(s.view);
          if (s.approved) setApproved(s.approved);
          if (s.checksByWeek) setChecksByWeek(s.checksByWeek);
          if (s.strengthByWeek) setStrengthByWeek(s.strengthByWeek);
          if (s.weighins) setWeighins(s.weighins);
          if (s.todayLog && s.todayLog.date === new Date().toISOString().slice(0, 10)) setTodayLog(s.todayLog);
        }
        if (isAdmin) setRoster(await db.loadRoster());
      } catch (e) { console.error("initial load failed", e); }
      setLoaded(true);
    })();
  }, [isAdmin]);

  /* PROD-TODO(db): persistence — replaces window.storage.set.
     The prototype blobbed all state into one key on every change.
     In production, write on the event that changed it instead:
     toggleCheck -> checkins row, weigh-in -> weighins row, logMeal ->
     meal_logs row, etc. This effect is left as a marker of everything
     that must persist; delete it once per-event writes exist. */
  useEffect(() => {
    if (!loaded) return;
    db.saveClientState({ profile, macros, view, approved, checksByWeek, strengthByWeek, weighins, todayLog });
  }, [profile, macros, view, approved, checksByWeek, strengthByWeek, weighins, todayLog, loaded]);

  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  /* Gating rules — PRESERVE VERBATIM. These run BEFORE any payment. */
  const submitIntake = () => {
    if (profile.pregnant) { setDeclineReason("pregnant"); setView("declined"); return; }
    if (profile.breastfeeding && Number(profile.monthsPP) < 6) { setDeclineReason("early"); setView("declined"); return; }
    if (profile.diet !== "none") { setDeclineReason("diet"); setView("declined"); return; }
    const m = computeMacros(profile);
    setMacros(m);
    setApproved(false);
    db.submitIntake(profile, m); // PROD-TODO(db): puts this mama in Callie's pending queue
    setView("pending");
  };

  /* PROD-TODO(stripe): checkout entry point. Wire to either the
     Payment Link or a Checkout Session created by a Pages Function.
     See the SEQUENCING DECISION note in CONFIG before wiring this to
     the sales-page button — the intake gates decline some applicants. */
  const startCheckout = () => {
    window.location.href = CONFIG.STRIPE_PAYMENT_LINK;
  };

  const waterOz = profile.goalWeight ? Math.round(Number(profile.goalWeight) / 2) : null;

  /* Photo analysis — now proxied through /api/analyze so the
     Anthropic key stays server-side. See functions/api/analyze.js.
     The server returns the parsed JSON estimate directly. */
  const analyzePhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true); setPhotoResult(null);
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const resp = await fetch(CONFIG.ANALYZE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, media_type: file.type || "image/jpeg" }),
      });
      if (!resp.ok) throw new Error(`analyze failed: ${resp.status}`);
      const parsed = await resp.json();
      setPhotoResult(parsed.error ? { error: true } : parsed);
    } catch (e) {
      console.error("photo analysis failed", e);
      setPhotoResult({ error: true });
    }
    setPhotoBusy(false);
  };

  const logMeal = () => {
    if (!photoResult || photoResult.error) return;
    setTodayLog((tl) => ({
      date: new Date().toISOString().slice(0, 10),
      entries: [...tl.entries, { name: photoResult.meal, cal: photoResult.calories, p: photoResult.protein_g, c: photoResult.carbs_g, f: photoResult.fat_g }],
    }));
    setPhotoResult(null);
  };

  const totals = useMemo(() => todayLog.entries.reduce(
    (a, e) => ({ cal: a.cal + (e.cal || 0), p: a.p + (e.p || 0), c: a.c + (e.c || 0), f: a.f + (e.f || 0) }),
    { cal: 0, p: 0, c: 0, f: 0 }
  ), [todayLog]);

  const weeklyRate = useMemo(() => {
    if (weighins.length < 2) return null;
    const first = weighins[0], last = weighins[weighins.length - 1];
    const days = (new Date(last.date) - new Date(first.date)) / 86400000;
    if (days < 5) return null;
    return ((first.w - last.w) / days) * 7;
  }, [weighins]);

  const toggleCheck = (itemId, day) => {
    if (viewWk !== curWk && !editPast) return; // past weeks locked unless explicitly unlocked
    const key = `${itemId}|${day}`;
    setChecksByWeek((cw) => ({ ...cw, [viewWk]: { ...(cw[viewWk] || {}), [key]: !(cw[viewWk] || {})[key] } }));
  };

  const strengthFor = (wk) => strengthByWeek[wk] || (wk === curWk ? ["M", "W", "F"] : []);

  const adherenceFor = (wk) => {
    const ch = checksByWeek[wk] || {};
    let done = 0, total = 0;
    DEFAULT_ITEMS.forEach((it) => {
      if (it.daily) {
        DAYS.forEach((d) => { total += 1; if (ch[`${it.id}|${d}`]) done += 1; });
      } else {
        total += 3; // goal is 3 strength sessions, extra sessions are bonus
        const sc = DAYS.filter((d) => ch[`${it.id}|${d}`]).length;
        done += Math.min(sc, 3);
      }
    });
    return total ? Math.round((done / total) * 100) : 0;
  };
  const adherence = adherenceFor(curWk);

  const wkKeys = useMemo(() => {
    const ks = new Set([...Object.keys(checksByWeek), curWk]);
    return [...ks].sort();
  }, [checksByWeek, curWk]);
  const earliestWk = wkKeys[0];
  const progWeekNum = (wk) => Math.round((new Date(wk) - new Date(earliestWk)) / (7 * 86400000)) + 1;

  const trends = useMemo(() => {
    const weeks = wkKeys.filter((w) => Object.keys(checksByWeek[w] || {}).length > 0 || w === curWk);
    const n = weeks.length;
    if (n < 4) return { locked: true, n };
    const overall = weeks.map(adherenceFor);
    const half = Math.floor(n / 2);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    const delta = avg(overall.slice(half)) - avg(overall.slice(0, half));
    const items = DEFAULT_ITEMS.map((it) => {
      if (it.daily) {
        let hits = 0;
        weeks.forEach((w) => { const ch = checksByWeek[w] || {}; DAYS.forEach((d) => { if (ch[`${it.id}|${d}`]) hits += 1; }); });
        return { label: it.label, pct: Math.round((hits / (7 * n)) * 100), strength: false };
      }
      let sessions = 0;
      weeks.forEach((w) => { const ch = checksByWeek[w] || {}; sessions += DAYS.filter((d) => ch[`${it.id}|${d}`]).length; });
      return { label: it.label, avgSessions: sessions / n, strength: true };
    });
    const dailyItems = items.filter((i) => !i.strength);
    const best = [...dailyItems].sort((a, b) => b.pct - a.pct)[0];
    const worst = [...dailyItems].sort((a, b) => a.pct - b.pct)[0];
    return { locked: false, n, overall, delta, items, best, worst };
  }, [wkKeys, checksByWeek]);

  /* ------------------------- SALES PAGE --------------------------- */
  if (view === "sales" && !isAdmin) return (
    <Shell>
      <div style={{ padding: "30px 4px 8px" }}>
        <h1 style={{ fontFamily: FD, fontSize: 40, lineHeight: 1.12, margin: "0 0 14px", fontWeight: 400 }}>
          Lose the weight.<br />Keep the muscle.<br /><span style={{ color: T.accent }}>Eat like a mother.</span>
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: T.inkSoft, margin: "0 0 18px" }}>
          An 8-week macro program for moms who are done with 1,200-calorie plans that steal your energy, your muscle, and your milk supply. Personalized ranges, real food, and Callie in your pocket all week.
        </p>
        {/* PROD-TODO(stripe): today this goes to intake, and payment
            happens after Callie approves. If the flow changes to
            pay-first, swap this onClick to startCheckout. */}
        <Btn onClick={() => { setView("intake"); setStep(0); }} style={{ width: "100%" }}>Join the founding group — $149</Btn>
        <div style={{ textAlign: "center", fontSize: 12.5, color: T.inkSoft, marginTop: 8 }}>
          Founding price. Goes to $299+ after this group fills.
        </div>
      </div>

      <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 24, margin: "26px 0 12px" }}>What's inside</h2>
      {FEATURES.map((f) => (
        <Card key={f.title} style={{ marginBottom: 10, display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ fontSize: 24, lineHeight: 1 }}>{f.icon}</div>
          <div>
            <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 3 }}>{f.title}</div>
            <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>{f.body}</div>
          </div>
        </Card>
      ))}

      <Card style={{ marginTop: 14, background: T.accentSoft, border: "none" }}>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: T.accentDeep }}>
          <b>The promise:</b> we never crash. Losing faster than 1–1.5 lbs a week means you're losing muscle, and muscle is the whole point. We eat enough, we lift, we lose fat.
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 17, marginBottom: 6 }}>Who this is for</div>
        <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.7 }}>
          Moms 6+ months postpartum with weight they're ready to lose — including breastfeeding mamas (your macros are set gently; supply comes first).
          Not for pregnancy or the first six months of nursing, and the plan is built around animal protein.
        </div>
      </Card>

      <div style={{ margin: "20px 0 6px" }}>
        <Btn onClick={() => { setView("intake"); setStep(0); }} style={{ width: "100%" }}>Start my intake</Btn>
      </div>
    </Shell>
  );

  /* ------------------------- INTAKE ------------------------------- */
  if (view === "intake" && !isAdmin) {
    const steps = ["About you", "Postpartum", "Your goal", "Your tastes"];
    return (
      <Shell>
        <div style={{ display: "flex", gap: 6, margin: "10px 0 20px" }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 5, borderRadius: 99, background: i <= step ? T.accent : T.track }} />
          ))}
        </div>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "0 0 16px" }}>{steps[step]}</h2>

        {step === 0 && (
          <Card>
            <Field label="First name"><input style={inputStyle} value={profile.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" /></Field>
            <Field label="Age"><input style={inputStyle} inputMode="numeric" value={profile.age} onChange={(e) => set("age", e.target.value)} placeholder="33" /></Field>
            <Field label="Current weight (lbs)"><input style={inputStyle} inputMode="numeric" value={profile.currentWeight} onChange={(e) => set("currentWeight", e.target.value)} placeholder="162" /></Field>
            <Field label="Goal weight (lbs) — where you feel your best"><input style={inputStyle} inputMode="numeric" value={profile.goalWeight} onChange={(e) => set("goalWeight", e.target.value)} placeholder="145" /></Field>
            <Field label="Cell number — your WhatsApp group invite comes by text">
              <input style={inputStyle} inputMode="tel" value={profile.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 555-5555" />
            </Field>
            <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
              Callie personally invites every mama to the group chat. Heads up: members of a WhatsApp group can see each other's numbers.
            </div>
            <Btn style={{ width: "100%", marginTop: 4 }} disabled={!profile.goalWeight || !profile.currentWeight || !profile.phone} onClick={() => setStep(1)}>Continue</Btn>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <Field label="Are you currently pregnant?">
              <div style={{ display: "flex", gap: 8 }}>
                <Chip active={profile.pregnant === true} onClick={() => set("pregnant", true)}>Yes</Chip>
                <Chip active={profile.pregnant === false} onClick={() => set("pregnant", false)}>No</Chip>
              </div>
            </Field>
            <Field label="How many months postpartum are you?">
              <input style={inputStyle} inputMode="numeric" value={profile.monthsPP} onChange={(e) => set("monthsPP", e.target.value)} placeholder="9" />
            </Field>
            <Field label="Are you breastfeeding?">
              <div style={{ display: "flex", gap: 8 }}>
                <Chip active={profile.breastfeeding === true} onClick={() => set("breastfeeding", true)}>Yes</Chip>
                <Chip active={profile.breastfeeding === false} onClick={() => set("breastfeeding", false)}>No</Chip>
              </div>
            </Field>
            <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
              If you're nursing, your macros are set gently. Milk supply comes first, always.
            </div>
            <Btn style={{ width: "100%" }} disabled={profile.pregnant === null || profile.breastfeeding === null || !profile.monthsPP} onClick={() => setStep(2)}>Continue</Btn>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <Field label="What's your main goal?">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Chip active={profile.goal === "lose"} onClick={() => set("goal", "lose")}>Lose fat</Chip>
                <Chip active={profile.goal === "maintain"} onClick={() => set("goal", "maintain")}>Maintain</Chip>
                <Chip active={profile.goal === "gain"} onClick={() => set("goal", "gain")}>Build strength</Chip>
              </div>
            </Field>
            <Field label="How much are you moving right now?">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Chip active={profile.activity === "low"} onClick={() => set("activity", "low")}>Not much yet</Chip>
                <Chip active={profile.activity === "moderate"} onClick={() => set("activity", "moderate")}>Walks + some workouts</Chip>
                <Chip active={profile.activity === "high"} onClick={() => set("activity", "high")}>Very active</Chip>
              </div>
            </Field>
            <Field label="Stress level lately">
              <div style={{ display: "flex", gap: 8 }}>
                <Chip active={profile.stress === "low"} onClick={() => set("stress", "low")}>Low</Chip>
                <Chip active={profile.stress === "medium"} onClick={() => set("stress", "medium")}>Medium</Chip>
                <Chip active={profile.stress === "high"} onClick={() => set("stress", "high")}>High</Chip>
              </div>
            </Field>
            <Field label="Has a doctor mentioned insulin resistance or PCOS?">
              <div style={{ display: "flex", gap: 8 }}>
                <Chip active={profile.insulinResistance} onClick={() => set("insulinResistance", true)}>Yes</Chip>
                <Chip active={!profile.insulinResistance} onClick={() => set("insulinResistance", false)}>No</Chip>
              </div>
            </Field>
            <Field label="Do you eat animal protein?">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Chip active={profile.diet === "none"} onClick={() => set("diet", "none")}>Yes</Chip>
                <Chip active={profile.diet === "vegetarian"} onClick={() => set("diet", "vegetarian")}>Vegetarian</Chip>
                <Chip active={profile.diet === "vegan"} onClick={() => set("diet", "vegan")}>Vegan</Chip>
              </div>
            </Field>
            <Btn style={{ width: "100%", marginTop: 4 }} onClick={() => setStep(3)}>Continue</Btn>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>
              Last one, and it's the fun one. Tell Callie what you actually love to eat — your meal plan gets adapted to your tastes, not the other way around.
            </div>
            <Field label="Breakfast foods you love">
              <input style={inputStyle} value={profile.prefB} onChange={(e) => set("prefB", e.target.value)} placeholder="smoothies, bagels, anything with peanut butter" />
            </Field>
            <Field label="Lunch foods you love">
              <input style={inputStyle} value={profile.prefL} onChange={(e) => set("prefL", e.target.value)} placeholder="big salads, sandwiches, leftovers" />
            </Field>
            <Field label="Dinner foods you love">
              <input style={inputStyle} value={profile.prefD} onChange={(e) => set("prefD", e.target.value)} placeholder="tacos, pasta night, asian flavors" />
            </Field>
            <Btn style={{ width: "100%", marginTop: 4 }} onClick={submitIntake}>Send to Callie</Btn>
          </Card>
        )}
      </Shell>
    );
  }

  /* ------------------------- DECLINED ----------------------------- */
  if (view === "declined" && !isAdmin) {
    const msgs = {
      pregnant: { title: "Congratulations, mama.", body: "This program isn't built for pregnancy — your body needs abundance right now, not a deficit. Come back after baby arrives and you're at least six months postpartum. I'd love to have you then." },
      early: { title: "Not yet — and that's on purpose.", body: "You're under six months postpartum while breastfeeding, and I won't risk your milk supply. Your body is doing its most important work right now. Circle back once you pass the six-month mark; the program will be here." },
      diet: { title: "This one isn't the right fit.", body: "The program is built around animal protein — hitting these targets on a vegetarian or vegan diet is a different playbook, and I'd rather point you to a coach who specializes in it than give you a plan that fights you." },
    };
    const m = msgs[declineReason] || msgs.diet;
    return (
      <Shell>
        <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 34 }}>🤍</div>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>{m.title}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>{m.body}</p>
          <Btn ghost onClick={() => setView("sales")} style={{ marginTop: 8 }}>Back to start</Btn>
        </Card>
      </Shell>
    );
  }

  /* ------------------------- ADMIN PORTAL -------------------------
     Prototype used a client-side toggle + a merged "you" live-intake
     row. In production this route is reached only when isAdmin is
     true, and every client (including fresh intakes) is a real row
     in the roster loaded from the database. RLS must also protect
     these queries server-side. */
  if (isAdmin) {
    const all = roster;
    const pendings = all.filter((c) => c.status === "pending");
    const actives = all.filter((c) => c.status === "active");
    const needsAttention = (c) => {
      const r = rateOf(c.weighins);
      const flags = [];
      if (r !== null && r > 1.5) flags.push("losing too fast");
      if (c.status === "active" && c.adherence < 60) flags.push("low adherence");
      return flags;
    };
    const attentionCount = actives.filter((c) => needsAttention(c).length > 0).length;

    const patchMacros = (c, k, v) => {
      const next = { ...c.macros, [k]: Number(v) || 0 };
      setRoster((rs) => rs.map((x) => (x.id === c.id ? { ...x, macros: next } : x)));
      db.updateClientMacros(c.id, next); // PROD-TODO(db): persist edit; debounce in real build
    };
    const approveClient = (c) => {
      setRoster((rs) => rs.map((x) => (x.id === c.id ? { ...x, status: "active", week: 1 } : x)));
      db.approveClient(c.id); // PROD-TODO(db): sets approved=true; Callie then texts the WhatsApp invite
    };

    const sel = all.find((c) => c.id === adminSel);

    /* ---- client detail ---- */
    if (sel) {
      const r = rateOf(sel.weighins);
      const flags = needsAttention(sel);
      return (
        <Shell>
          <button onClick={() => setAdminSel(null)} style={{ background: "none", border: "none", color: T.accent, fontWeight: 700, fontSize: 14, cursor: "pointer", padding: "4px 0 10px" }}>← All clients</button>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: FD, fontSize: 22 }}>{sel.name}</div>
                <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.6 }}>
                  {sel.age} yrs · {sel.currentWeight} → {sel.goalWeight} lbs · {sel.monthsPP} mo postpartum
                  {sel.breastfeeding ? " · breastfeeding" : ""}
                  {sel.phone ? <><br />📱 {sel.phone}{sel.status === "pending" ? " — send WhatsApp invite on approval" : ""}</> : null}
                  {(sel.prefB || sel.prefL || sel.prefD) ? <><br />🍽 Loves: {[sel.prefB, sel.prefL, sel.prefD].filter(Boolean).join(" · ")}</> : null}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: sel.status === "active" ? T.sageSoft : T.amberSoft, color: sel.status === "active" ? T.sage : T.amber, whiteSpace: "nowrap" }}>
                {sel.status === "active" ? `Week ${sel.week}` : "Pending"}
              </span>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, margin: "6px 0 8px" }}>Ranges — edit any number</div>
            {["cal", "protein", "fat", "carbs"].map((k) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 74, fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "capitalize" }}>{k === "cal" ? "Calories" : k}</div>
                <input style={{ ...inputStyle, width: 110, padding: "8px 10px" }} inputMode="numeric" value={sel.macros[k]}
                  onChange={(e) => patchMacros(sel, k, e.target.value)} />
                <span style={{ fontSize: 13, color: T.inkSoft }}>→ {sel.macros[k]}–{sel.macros[k] + (k === "cal" ? 150 : 10)}{k === "cal" ? "" : "g"}</span>
              </div>
            ))}
            {sel.macros.notes?.length > 0 && (
              <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", margin: "10px 0" }}>
                {sel.macros.notes.map((n, i) => <div key={i} style={{ fontSize: 13, color: T.amber, lineHeight: 1.5 }}>• {n}</div>)}
              </div>
            )}
            {sel.status === "pending"
              ? <Btn style={{ width: "100%", marginTop: 6 }} onClick={() => approveClient(sel)}>Approve + release to {sel.name.split(" ")[0]}</Btn>
              : <div style={{ fontSize: 13, color: T.sage, fontWeight: 700, marginTop: 4 }}>✓ Live. Edits reach her dashboard instantly.</div>}
          </Card>

          {sel.status === "active" && (
            <Card style={{ marginTop: 12 }}>
              <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 4 }}>Progress</div>
              <div style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 8 }}>
                Checklist this week: <b style={{ color: sel.adherence < 60 ? T.amber : T.ink }}>{sel.adherence}%</b>
                {r !== null && <> · trending <b style={{ color: r > 1.5 ? T.amber : T.sage }}>{Math.abs(r).toFixed(1)} lb/wk {r < 0 ? "up" : "down"}</b></>}
              </div>
              {flags.length > 0 && (
                <div style={{ background: T.amberSoft, borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
                  {flags.map((f) => (
                    <div key={f} style={{ fontSize: 13, color: T.amber, lineHeight: 1.5 }}>
                      ⚠ {f === "losing too fast" ? "Losing faster than 1.5 lb/wk — voice-note her to eat the top of her ranges." : "Adherence under 60% — a personal check-in usually turns this around."}
                    </div>
                  ))}
                </div>
              )}
              {sel.weighins.length > 1 && (
                <div style={{ height: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sel.weighins.map((x) => ({ ...x, label: x.date.slice(5) }))} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke={T.track} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                      <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontFamily: F, fontSize: 13, borderRadius: 10, border: `1px solid ${T.border}` }} />
                      {sel.goalWeight && <ReferenceLine y={Number(sel.goalWeight)} stroke={T.sage} strokeDasharray="5 4" label={{ value: "goal", fontSize: 11, fill: T.sage, position: "right" }} />}
                      <Line type="monotone" dataKey="w" stroke={T.accent} strokeWidth={2.5} dot={{ r: 4, fill: T.accent }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          )}
        </Shell>
      );
    }

    /* ---- roster ---- */
    const Row = ({ c }) => {
      const r = rateOf(c.weighins);
      const flags = needsAttention(c);
      return (
        <button onClick={() => setAdminSel(c.id)} style={{ display: "block", width: "100%", textAlign: "left", background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "13px 16px", marginBottom: 8, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontFamily: FD, fontSize: 16, color: T.ink }}>{c.name}</span>
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
                {c.status === "pending"
                  ? `${c.currentWeight} → ${c.goalWeight} lbs${c.breastfeeding ? " · breastfeeding" : ""} · awaiting your review`
                  : <>Week {c.week} · adherence {c.adherence}%{r !== null && <> · {Math.abs(r).toFixed(1)} lb/wk {r < 0 ? "up" : "down"}</>}</>}
              </div>
              {flags.length > 0 && (
                <div style={{ fontSize: 12, fontWeight: 700, color: T.amber, marginTop: 3 }}>⚠ {flags.join(" · ")}</div>
              )}
            </div>
            <span style={{ color: T.inkSoft, fontSize: 18 }}>›</span>
          </div>
        </button>
      );
    };

    return (
      <Shell>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 4px" }}>Your mamas</h2>
        <div style={{ display: "flex", gap: 8, margin: "8px 0 18px" }}>
          {[["Active", actives.length, T.sageSoft, T.sage], ["Pending", pendings.length, T.amberSoft, T.amber], ["Need you", attentionCount, T.accentSoft, T.accentDeep]].map(([l, n, bg, col]) => (
            <div key={l} style={{ flex: 1, background: bg, borderRadius: 12, padding: "10px 0", textAlign: "center" }}>
              <div style={{ fontFamily: FD, fontSize: 22, color: col }}>{n}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: col }}>{l}</div>
            </div>
          ))}
        </div>

        {pendings.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Waiting on your approval</div>
            {pendings.map((c) => <Row key={c.id} c={c} />)}
          </>
        )}
        <div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 8px" }}>Active</div>
        {actives.length ? actives.map((c) => <Row key={c.id} c={c} />) : <div style={{ fontSize: 13.5, color: T.inkSoft }}>No active clients yet — approve your pending mamas to start their 8 weeks.</div>}
      </Shell>
    );
  }

  /* ------------------------- PENDING (client) --------------------- */
  if (view === "pending") return (
    <Shell>
      <Card style={{ marginTop: 30, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 34 }}>💌</div>
        <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "10px 0" }}>Callie is building your macros</h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.inkSoft }}>
          Your answers are with her now. She reviews every mama's numbers personally before they go live — usually within a day. The moment she approves, your dashboard unlocks and your WhatsApp group invite arrives by text.
        </p>
      </Card>
    </Shell>
  );

  /* ------------------------- CLIENT APP --------------------------- */
  const hi = (n, d = 10) => n + d;
  return (
    <Shell>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "center", gap: 4, padding: "8px 0 14px", zIndex: 5 }}>
        {[["today", "Today"], ["meals", "Meals"], ["progress", "Progress"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            fontFamily: F, fontSize: 14, fontWeight: 700, padding: "9px 22px", borderRadius: 999, border: "none", cursor: "pointer",
            background: tab === k ? T.accentSoft : "transparent", color: tab === k ? T.accentDeep : T.inkSoft,
          }}>{l}</button>
        ))}
      </nav>

      {tab === "today" && macros && (
        <>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>
            {profile.name ? `Hi ${profile.name}.` : "Your ranges."}
          </h2>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>Live inside the bands. Busy, active day? Eat the top. Slow day? The bottom. Both count as a win.</p>

          <Card style={{ marginBottom: 12, background: T.accentSoft, border: "none", display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ fontSize: 26 }}>💬</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, flex: 1 }}>
              <b>The Mamas group chat</b><br />
              <span style={{ color: T.inkSoft, fontSize: 13 }}>Callie's in the chat Mon–Fri and answers in voice notes. Her Monday drop sets the week's focus — plate pics and wins always welcome.</span>
            </div>
            {/* PROD-TODO(whatsapp): wire or hide until the group link/flow is decided */}
            <Btn small onClick={() => window.open(CONFIG.WHATSAPP_GROUP_URL, "_blank")}>Open</Btn>
          </Card>

          <Card>
            <RangeBand label="Protein" lo={macros.protein} hi={hi(macros.protein)} eaten={totals.p} />
            <RangeBand label="Carbs" lo={macros.carbs} hi={hi(macros.carbs)} eaten={totals.c} />
            <RangeBand label="Fat — watch this one" lo={macros.fat} hi={hi(macros.fat)} eaten={totals.f} />
            <div style={{ borderTop: `1px dashed ${T.border}`, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4 }}>
                Calories land around{totals.cal > 0 ? ` · logged ${Math.round(totals.cal)}` : ""}
              </span>
              <span style={{ fontFamily: FD, fontSize: 22 }}>{macros.cal}–{macros.cal + 150}</span>
            </div>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ fontSize: 26 }}>📸</div>
              <div style={{ flex: 1, fontSize: 14, lineHeight: 1.5 }}>
                <b>Snap your plate</b><br />
                <span style={{ color: T.inkSoft, fontSize: 13 }}>Photo in, macro estimate out. No weighing, no guessing.</span>
              </div>
              <label style={{
                fontFamily: F, fontWeight: 700, fontSize: 13, cursor: photoBusy ? "default" : "pointer",
                padding: "8px 14px", borderRadius: 999, background: photoBusy ? "#D9C4CE" : T.accent, color: "#fff",
              }}>
                {photoBusy ? "Reading…" : "Snap"}
                <input type="file" accept="image/*" capture="environment" disabled={photoBusy} style={{ display: "none" }}
                  onChange={(e) => { analyzePhoto(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            <label style={{ display: "inline-block", marginTop: 8, fontSize: 13, fontWeight: 700, color: T.accent, cursor: photoBusy ? "default" : "pointer", textDecoration: "underline" }}>
              or choose from your photo library
              <input type="file" accept="image/*" disabled={photoBusy} style={{ display: "none" }}
                onChange={(e) => { analyzePhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>

            {photoBusy && (
              <div style={{ marginTop: 12, fontSize: 13.5, color: T.inkSoft }}>Looking at your plate… this takes a few seconds.</div>
            )}

            {photoResult && photoResult.error && (
              <div style={{ marginTop: 12, background: T.amberSoft, borderRadius: 12, padding: "10px 14px", fontSize: 13.5, color: T.amber, lineHeight: 1.5 }}>
                Couldn't read that one — try a clearer shot from above, with the whole plate in frame.
              </div>
            )}

            {photoResult && !photoResult.error && (
              <div style={{ marginTop: 12, background: T.accentSoft, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontFamily: FD, fontSize: 17 }}>{photoResult.meal}</div>
                <div style={{ fontSize: 12.5, color: T.inkSoft, margin: "2px 0 8px" }}>{(photoResult.items || []).join(" · ")}</div>
                <div style={{ display: "flex", gap: 14, fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>
                  <span>{photoResult.calories} cal</span>
                  <span style={{ color: T.accentDeep }}>P {photoResult.protein_g}g</span>
                  <span style={{ color: T.inkSoft }}>C {photoResult.carbs_g}g</span>
                  <span style={{ color: T.inkSoft }}>F {photoResult.fat_g}g</span>
                </div>
                {photoResult.tip && <div style={{ fontSize: 13, color: T.accentDeep, lineHeight: 1.5, marginBottom: 10 }}>💬 {photoResult.tip}</div>}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Btn small onClick={logMeal}>Add to today</Btn>
                  <button onClick={() => setPhotoResult(null)} style={{ background: "none", border: "none", fontSize: 13, color: T.inkSoft, cursor: "pointer", textDecoration: "underline" }}>discard</button>
                  <span style={{ fontSize: 11.5, color: T.inkSoft, marginLeft: "auto" }}>AI estimate · {photoResult.confidence} confidence</span>
                </div>
              </div>
            )}

            {todayLog.entries.length > 0 && (
              <div style={{ marginTop: 12, borderTop: `1px dashed ${T.border}`, paddingTop: 10 }}>
                {todayLog.entries.map((e, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                    <span style={{ color: T.ink }}>{e.name}</span>
                    <span style={{ color: T.inkSoft }}>{e.cal} cal · P{e.p} C{e.c} F{e.f}</span>
                  </div>
                ))}
                <button onClick={() => setTodayLog({ date: new Date().toISOString().slice(0, 10), entries: [] })}
                  style={{ background: "none", border: "none", fontSize: 12, color: T.accent, cursor: "pointer", padding: "6px 0 0", textDecoration: "underline" }}>
                  clear today
                </button>
              </div>
            )}
            <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.4 }}>
              Estimates are ballpark — great for awareness, and your Cronometer log is still the source of truth.
            </div>
          </Card>

          <Card style={{ marginTop: 12, display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ fontSize: 26 }}>💧</div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              <b>{waterOz} oz of water today</b> (half your goal weight), plus electrolytes.
              {/* PROD-TODO(fullscript) */}
              <a href={CONFIG.FULLSCRIPT_ELECTROLYTES} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}> Callie's electrolytes on Fullscript →</a>
            </div>
          </Card>

          {(() => {
            const isCur = viewWk === curWk;
            const editable = isCur || editPast;
            const vChecks = checksByWeek[viewWk] || {};
            const vAdh = adherenceFor(viewWk);
            const navBtn = (dir, disabled) => (
              <button disabled={disabled} onClick={() => { setViewWk(addDaysIso(viewWk, 7 * dir)); setEditPast(false); }} style={{
                width: 32, height: 32, borderRadius: "50%", border: `1.5px solid ${disabled ? T.track : T.border}`,
                background: "#fff", color: disabled ? "#D8CCD1" : T.ink, fontSize: 16, cursor: disabled ? "default" : "pointer",
              }}>{dir < 0 ? "‹" : "›"}</button>
            );
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 0 4px" }}>
                  <h3 style={{ fontFamily: FD, fontWeight: 400, fontSize: 20, margin: 0 }}>
                    Week {progWeekNum(viewWk)} <span style={{ fontFamily: F, fontSize: 13, color: T.inkSoft }}>· {fmtRange(viewWk)}{isCur ? " · this week" : ""}</span>
                  </h3>
                  <div style={{ display: "flex", gap: 6 }}>
                    {navBtn(-1, viewWk <= earliestWk)}
                    {navBtn(1, isCur)}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 10px", gap: 10 }}>
                  <p style={{ fontSize: 13, color: T.inkSoft, margin: 0, flex: 1 }}>
                    {isCur
                      ? "Tap the days as you go. Strength days are yours to move."
                      : editPast
                        ? "Unlocked — fill in what you actually did, then lock it back up."
                        : "A look back. Forgot to log a day? Unlock it below."}
                  </p>
                  {!isCur && (
                    <button onClick={() => setEditPast(!editPast)} style={{
                      fontFamily: F, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                      padding: "7px 12px", borderRadius: 999, border: `1.5px solid ${T.accent}`,
                      background: editPast ? T.accent : "transparent", color: editPast ? "#fff" : T.accent,
                    }}>{editPast ? "🔓 Done editing" : "🔒 Edit this week"}</button>
                  )}
                </div>

                <Card>
                  {DEFAULT_ITEMS.map((it) => {
                    const strengthDone = it.daily ? 0 : DAYS.filter((d) => vChecks[`${it.id}|${d}`]).length;
                    return (
                      <div key={it.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                          {it.label}
                          {it.id === "water" && waterOz ? <span style={{ color: T.inkSoft, fontWeight: 400 }}> · {waterOz} oz</span> : null}
                          {it.id === "strength" && (
                            <span style={{ color: T.inkSoft, fontWeight: 400 }}>
                              {" "}· goal 3× a week{strengthDone >= 3 ? " · ✓ goal hit" : ""}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {DAYS.map((d) => {
                            const done = vChecks[`${it.id}|${d}`];
                            return (
                              <button key={d}
                                onClick={() => { if (editable) toggleCheck(it.id, d); }}
                                style={{
                                  width: 36, height: 36, borderRadius: "50%", fontSize: 12, fontWeight: 700,
                                  cursor: editable ? "pointer" : "default",
                                  border: `1.5px solid ${done ? T.sage : T.border}`,
                                  background: done ? T.sage : "#fff",
                                  color: done ? "#fff" : T.ink,
                                  opacity: editable ? 1 : 0.85,
                                }}>{DAY_LABEL[d]}</button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ paddingTop: 12, fontSize: 13, color: T.inkSoft }}>
                    {isCur ? "Week so far: " : "This week finished at: "}
                    <b style={{ color: vAdh >= 70 ? T.sage : T.ink }}>{vAdh}%</b> — progress, not perfection.
                  </div>
                </Card>
              </>
            );
          })()}

          <Card style={{ marginTop: 12, background: T.sageSoft, border: "none" }}>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "#3E5A46" }}>
              <b>Morning sunlight + one or two walks</b> aren't extras — they steady your cortisol and your cravings. Ten minutes outside before scrolling.
            </div>
          </Card>
        </>
      )}

      {tab === "meals" && (
        <>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>Automate your plate</h2>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>Same breakfasts, similar lunches, dinner gets to be fun. Repetition is the secret — decide once, win all week.</p>

          <Card style={{ background: T.accentSoft, border: "none", marginBottom: 14 }}>
            {SKELETONS.map((s) => (
              <div key={s.meal} style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: FD, fontSize: 17, color: T.accentDeep }}>{s.meal} <span style={{ fontFamily: F, fontSize: 13, color: T.inkSoft }}>— {s.formula}</span></div>
                <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.6 }}>{s.lines.join(" · ")}</div>
              </div>
            ))}
            <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
              House rules: max 2 whole eggs per meal (egg whites are free game) · sweeten with honey, maple, or applesauce · organic where you can.
            </div>
          </Card>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {["All", "Breakfast", "Lunch", "Dinner"].map((c) => (
              <Chip key={c} active={mealFilter === c} onClick={() => setMealFilter(c)}>{c}</Chip>
            ))}
          </div>

          {RECIPES.filter((r) => mealFilter === "All" || r.cat === mealFilter).map((r) => (
            <Card key={r.name} style={{ marginBottom: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 0.8, textTransform: "uppercase" }}>{r.cat}{r.serves > 1 ? ` · serves ${r.serves}` : ""}</div>
              <div style={{ fontFamily: FD, fontSize: 18, margin: "2px 0 4px" }}>{r.name}</div>
              <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>{r.desc}</div>
              <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 13, fontWeight: 700 }}>
                <span>{r.cal} cal</span>
                <span style={{ color: T.accentDeep }}>P {r.p}g</span>
                <span style={{ color: T.inkSoft }}>C {r.c}g</span>
                <span style={{ color: T.inkSoft }}>F {r.f}g</span>
                <span style={{ color: T.inkSoft, fontWeight: 400 }}>per serving</span>
              </div>
            </Card>
          ))}
        </>
      )}

      {tab === "progress" && (
        <>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>Weekly weigh-in</h2>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>Same day each week, first thing in the morning, before coffee. The trend matters, the daily number doesn't.</p>

          <Card>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} inputMode="decimal" placeholder="This week's weight (lbs)" value={wInput} onChange={(e) => setWInput(e.target.value)} />
              <Btn small onClick={() => {
                const w = parseFloat(wInput);
                if (!w) return;
                setWeighins((arr) => [...arr, { date: new Date().toISOString().slice(0, 10), w }]);
                setWInput("");
              }}>Log it</Btn>
            </div>

            {weighins.length > 1 && (
              <div style={{ height: 190, marginTop: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weighins.map((x) => ({ ...x, label: x.date.slice(5) }))} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke={T.track} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                    <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11, fill: T.inkSoft }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontFamily: F, fontSize: 13, borderRadius: 10, border: `1px solid ${T.border}` }} />
                    {profile.goalWeight && <ReferenceLine y={Number(profile.goalWeight)} stroke={T.sage} strokeDasharray="5 4" label={{ value: "goal", fontSize: 11, fill: T.sage, position: "right" }} />}
                    <Line type="monotone" dataKey="w" stroke={T.accent} strokeWidth={2.5} dot={{ r: 4, fill: T.accent }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {weeklyRate !== null && (
              <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: weeklyRate > 1.5 ? T.amberSoft : T.sageSoft }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: weeklyRate > 1.5 ? T.amber : "#3E5A46" }}>
                  Trending {Math.abs(weeklyRate).toFixed(1)} lb/week {weeklyRate < 0 ? "up" : "down"}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: weeklyRate > 1.5 ? T.amber : "#3E5A46" }}>
                  {weeklyRate > 1.5
                    ? "That's faster than 1.5 lbs a week, which means you're likely losing muscle, not just fat. Eat the top of your ranges this week — more food, not less. This is the rule of the whole program."
                    : "Right in the healthy zone. Fat is leaving, muscle is staying. Keep doing exactly this."}
                </div>
              </div>
            )}
          </Card>

          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Your 4-week trends</div>
            {trends.locked ? (
              <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6 }}>
                Unlocks after four weeks of tracking so the patterns are real, not noise. You're at <b style={{ color: T.ink }}>{trends.n} of 4</b> — keep checking those boxes.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: T.inkSoft, marginBottom: 10 }}>
                  Across your last {trends.n} weeks, your consistency is{" "}
                  <b style={{ color: trends.delta >= 0 ? T.sage : T.amber }}>
                    {trends.delta >= 3 ? "climbing" : trends.delta <= -3 ? "slipping" : "holding steady"}
                  </b>
                  {" "}({trends.overall.map((o) => `${o}%`).join(" → ")}).
                </div>
                {trends.items.map((i) => (
                  <div key={i.label} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                      <span style={{ color: T.ink, fontWeight: 600 }}>{i.label}</span>
                      <span style={{ color: T.inkSoft }}>{i.strength ? `${i.avgSessions.toFixed(1)}× / wk (goal 3)` : `${i.pct}%`}</span>
                    </div>
                    <div style={{ height: 6, background: T.track, borderRadius: 99 }}>
                      <div style={{ height: 6, borderRadius: 99, width: `${i.strength ? Math.min((i.avgSessions / 3) * 100, 100) : i.pct}%`, background: (i.strength ? i.avgSessions >= 3 : i.pct >= 70) ? T.sage : T.accent }} />
                    </div>
                  </div>
                ))}
                <div style={{ background: T.accentSoft, borderRadius: 12, padding: "10px 14px", marginTop: 10, fontSize: 13, color: T.accentDeep, lineHeight: 1.55 }}>
                  💬 Strongest habit: <b>{trends.best.label.toLowerCase()}</b> ({trends.best.pct}%). The one to love on next: <b>{trends.worst.label.toLowerCase()}</b> ({trends.worst.pct}%) — pick your easiest day and start there.
                </div>
              </>
            )}
          </Card>

          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Before + after photos</div>
            <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6 }}>
              Week 1 and week 8: same outfit, same spot, same lighting, front and side. Faces optional. The most transformed mama in this founding group wins Callie's Gut Reset Guide.
            </div>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Need extra support?</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.8 }}>
              {/* PROD-TODO(fullscript): wire all three links */}
              <a href={CONFIG.FULLSCRIPT_SLEEP} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}>Sleep support →</a><br />
              <a href={CONFIG.FULLSCRIPT_DIGESTION} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}>Digestion support →</a><br />
              <a href={CONFIG.FULLSCRIPT_ELECTROLYTES} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}>Electrolytes →</a>
            </div>
          </Card>
        </>
      )}
    </Shell>
  );
}
