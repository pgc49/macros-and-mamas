import { describe, expect, it } from "vitest";
import {
  enrichQuizLeads,
  filterQuizLeads,
  formatLeadCampaign,
  formatLeadTags,
  formatLeadWhen,
  formatMacroRanges,
  leadInsightRows,
  isMetaAdLead,
  isMetaClickLead,
  isMetaLead,
  isReferralLead,
  leadDisplayName,
  loadQuizLeads,
  quizLeadFunnelLabel,
  quizLeadFunnelStatus,
  quizLeadSourceKind,
  quizLeadSourceLabel,
  quizReferralWho,
} from "./quizLeads";

const MEGAN = "11111111-1111-4111-8111-111111111111";
const KRISTEN = "22222222-2222-4222-8222-222222222222";
const ALEX = "33333333-3333-4333-8333-333333333333";
const JENNIFER = "44444444-4444-4444-8444-444444444444";

function lead(over = {}) {
  return {
    id: "lead-1",
    email: "mama@example.com",
    first_name: "Dolly",
    last_name: "Chammas",
    created_at: "2026-08-19T18:00:00.000Z",
    fbp: null,
    fbc: null,
    utm_source: null,
    utm_medium: null,
    referred_by: null,
    flags: [],
    segment: "main",
    protein_low_g: 110,
    protein_high_g: 130,
    carbs_low_g: 140,
    carbs_high_g: 180,
    fat_low_g: 50,
    fat_high_g: 65,
    calories_low: 1800,
    calories_high: 2000,
    ...over,
  };
}

describe("isMetaAdLead / isMetaClickLead", () => {
  it("Ellie-shaped: Meta utm_source + paid medium is Meta ad, even with fbc", () => {
    const ellie = lead({
      fbc: "fb.1.1.abc",
      fbp: "fb.1.1.xyz",
      utm_source: "meta",
      utm_medium: "cpc",
    });
    expect(isMetaAdLead(ellie)).toBe(true);
    expect(isMetaLead(ellie)).toBe(true);
    expect(isMetaClickLead(ellie)).toBe(false);
    expect(quizLeadSourceKind(ellie)).toBe("meta_ad");
    expect(quizLeadSourceLabel(ellie)).toBe("Meta ad");
  });

  it("treats facebook/ig/instagram/fb/meta + cpc/paid/paidsocial as Ad, case-insensitive", () => {
    for (const source of ["facebook", "IG", "Instagram", "fb", "Meta"]) {
      for (const medium of ["cpc", "Paid", "PaidSocial"]) {
        expect(isMetaAdLead(lead({ utm_source: source, utm_medium: medium }))).toBe(true);
      }
    }
  });

  it("fbc without ad UTMs is Meta link, not Ad", () => {
    expect(isMetaClickLead(lead({ fbc: "fb.1.1.abc" }))).toBe(true);
    expect(isMetaAdLead(lead({ fbc: "fb.1.1.abc" }))).toBe(false);
    expect(quizLeadSourceKind(lead({ fbc: "fb.1.1.abc" }))).toBe("meta_click");
    expect(quizLeadSourceLabel(lead({ fbc: "fb.1.1.abc" }))).toBe("Meta link");
    expect(isMetaAdLead(lead({ utm_source: "meta" }))).toBe(false);
    expect(isMetaAdLead(lead({ utm_source: "meta", utm_medium: "social" }))).toBe(false);
  });

  it("Matt-test fbp only is organic — pixel id is not Meta or Ad", () => {
    const matt = lead({ fbp: "fb.1.1.xyz" });
    expect(isMetaAdLead(matt)).toBe(false);
    expect(isMetaClickLead(matt)).toBe(false);
    expect(isMetaLead(matt)).toBe(false);
    expect(quizLeadSourceKind(matt)).toBe("organic");
    expect(quizLeadSourceLabel(matt)).toBe("Organic");
  });

  it("does not invent Ad from empty cookies, google utm, or a missing fbclid", () => {
    expect(isMetaAdLead(lead())).toBe(false);
    expect(isMetaClickLead(lead())).toBe(false);
    expect(isMetaAdLead(lead({ fbp: "  ", fbc: "" }))).toBe(false);
    expect(isMetaAdLead(lead({ utm_source: "google", utm_medium: "cpc" }))).toBe(false);
    expect(isMetaAdLead(lead({ fbclid: "abc" }))).toBe(false);
    expect(isMetaClickLead(lead({ fbclid: "abc" }))).toBe(false);
  });
});

describe("quizLeadSourceKind", () => {
  it("labels Meta ad, Meta link, and referral separately; referral stacks", () => {
    expect(quizLeadSourceKind(lead({ utm_source: "meta", utm_medium: "cpc" }))).toBe("meta_ad");
    expect(quizLeadSourceKind(lead({ fbc: "fb.1.1.abc" }))).toBe("meta_click");
    expect(quizLeadSourceKind(lead({ referred_by: "Callie", fbc: "fb.1.1.abc" }))).toBe("meta_click_referral");
    expect(quizLeadSourceKind(lead({ referred_by: "Callie" }))).toBe("referral");
    expect(quizLeadSourceKind(lead())).toBe("organic");
    expect(quizLeadSourceLabel(lead({ referred_by: "Callie" }))).toBe("Referral · Callie");
    expect(quizLeadSourceLabel(lead({ fbc: "fb.1.1.abc" }))).toBe("Meta link");
    expect(quizLeadSourceLabel(lead({ utm_source: "meta", utm_medium: "cpc" }))).toBe("Meta ad");
    expect(quizLeadSourceLabel(lead({ fbp: "fb.1.1.xyz" }))).toBe("Organic");
  });

  it("Alex-shaped: fbc + KRISTEN25 is Meta link · Kristen, not Ad", () => {
    const alex = lead({
      email: "alex@example.com",
      fbc: "fb.1.1.igclick",
      fbp: "fb.1.1.xyz",
      referred_by: null,
      referralCode: "KRISTEN25",
      referralAdvocateFirstName: "Kristen",
    });
    expect(isMetaAdLead(alex)).toBe(false);
    expect(isMetaClickLead(alex)).toBe(true);
    expect(isReferralLead(alex)).toBe(true);
    expect(quizLeadSourceKind(alex)).toBe("meta_click_referral");
    expect(quizReferralWho(alex)).toBe("Kristen");
    expect(quizLeadSourceLabel(alex)).toBe("Meta link · Kristen");
  });

  it("Jennifer-shaped: promo MEGAN25 with no fbc is Referral · Megan, not organic", () => {
    const jennifer = lead({
      email: "jennifer@example.com",
      fbp: null,
      fbc: null,
      referred_by: null,
      referralCode: "MEGAN25",
      referralAdvocateFirstName: "Megan",
    });
    expect(isMetaAdLead(jennifer)).toBe(false);
    expect(isMetaClickLead(jennifer)).toBe(false);
    expect(isReferralLead(jennifer)).toBe(true);
    expect(quizLeadSourceKind(jennifer)).toBe("referral");
    expect(quizLeadSourceLabel(jennifer)).toBe("Referral · Megan");
  });

  it("prefers advocate first name, else the promo code, else quiz referred_by", () => {
    expect(quizReferralWho(lead({
      referred_by: "Callieeee",
      referralCode: "KRISTEN25",
      referralAdvocateFirstName: "Kristen",
    }))).toBe("Kristen");
    expect(quizReferralWho(lead({
      referred_by: "Callieeee",
      referralCode: "KRISTEN25",
    }))).toBe("KRISTEN25");
    expect(quizReferralWho(lead({ referred_by: "Callie" }))).toBe("Callie");
  });
});

describe("quizLeadFunnelStatus", () => {
  it("is quiz only until a non-admin profile exists, then unpaid or paid", () => {
    expect(quizLeadFunnelStatus(null)).toBe("quiz_only");
    expect(quizLeadFunnelStatus({ id: MEGAN, paid: false })).toBe("signed_up_unpaid");
    expect(quizLeadFunnelStatus({ id: MEGAN, paid: true })).toBe("paid");
    expect(quizLeadFunnelStatus({ id: MEGAN, paid: false, paid_at: "2026-08-19T12:00:00.000Z" })).toBe("paid");
    expect(quizLeadFunnelLabel("quiz_only")).toBe("Quiz only");
    expect(quizLeadFunnelLabel("signed_up_unpaid")).toBe("Signed up unpaid");
    expect(quizLeadFunnelLabel("paid")).toBe("Paid");
  });
});

describe("enrichQuizLeads + filterQuizLeads", () => {
  const leads = [
    lead({
      id: "ellie",
      email: "ellie@example.com",
      first_name: "Ellie",
      last_name: "Rose",
      fbc: "fb.1.1.abc",
      utm_source: "meta",
      utm_medium: "cpc",
    }),
    lead({
      id: "organic-unpaid",
      email: "Unpaid@example.com",
      first_name: "Una",
      last_name: "Paid",
    }),
    lead({
      id: "organic-paid",
      email: "paid@example.com",
      first_name: "Paid",
      last_name: "Mama",
      utm_source: "newsletter",
    }),
    lead({
      id: "alex",
      email: "alex@example.com",
      first_name: "Alex",
      last_name: "Harrer",
      fbc: "fb.1.1.igclick",
      referred_by: null,
    }),
    lead({
      id: "jennifer",
      email: "jennifer@example.com",
      first_name: "Jennifer",
      last_name: "Stone",
      referred_by: null,
    }),
    lead({
      id: "pixel-only",
      email: "matt@example.com",
      first_name: "Matt",
      fbp: "fb.1.1.xyz",
    }),
  ];
  const profiles = [
    { id: "admin", email: "admin@example.com", role: "admin", paid: true, name: "Callie" },
    { id: "unpaid-id", email: "unpaid@example.com", role: "client", paid: false, name: "Una", created_at: "2026-08-18T17:00:00.000Z" },
    { id: "paid-id", email: "PAID@example.com", role: "client", paid: true, name: "Paid", created_at: "2026-08-18T17:00:00.000Z", paid_at: "2026-08-18T18:00:00.000Z" },
    { id: ALEX, email: "alex@example.com", role: "client", paid: true, name: "Alex" },
    { id: JENNIFER, email: "jennifer@example.com", role: "client", paid: true, name: "Jennifer" },
    { id: KRISTEN, email: "kristen@example.com", role: "client", paid: true, name: "Kristen Wells" },
    { id: MEGAN, email: "megan@example.com", role: "client", paid: true, name: "Megan" },
  ];
  const referrals = [
    {
      referred_email: "Alex@example.com",
      referred_user_id: ALEX,
      advocate_user_id: KRISTEN,
      code: "KRISTEN25",
      status: "paid",
      created_at: "2026-08-18T12:00:00.000Z",
    },
    {
      referred_email: "jennifer@example.com",
      referred_user_id: JENNIFER,
      advocate_user_id: MEGAN,
      code: "MEGAN25",
      status: "paid",
      created_at: "2026-08-17T12:00:00.000Z",
    },
  ];
  const rows = enrichQuizLeads(leads, profiles, referrals);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  it("joins profiles on lower(email) and skips admin rows", () => {
    expect(byId.ellie.funnelStatus).toBe("quiz_only");
    expect(byId.ellie.profileId).toBe(null);
    expect(byId.ellie.isMeta).toBe(true);
    expect(byId.ellie.isMetaAd).toBe(true);
    expect(byId["organic-unpaid"].funnelStatus).toBe("signed_up_unpaid");
    expect(byId["organic-unpaid"].profileId).toBe("unpaid-id");
    expect(byId["organic-unpaid"].profileCreatedAt).toBe("2026-08-18T17:00:00.000Z");
    expect(byId["organic-paid"].funnelStatus).toBe("paid");
    expect(byId["organic-paid"].profilePaidAt).toBe("2026-08-18T18:00:00.000Z");
    expect(byId["organic-paid"].sourceKind).toBe("organic");
  });

  it("joins referrals on lower(email) and prefers advocate first name", () => {
    expect(byId.ellie.sourceKind).toBe("meta_ad");
    expect(quizLeadSourceLabel(byId.ellie)).toBe("Meta ad");

    expect(byId.alex.isMeta).toBe(false);
    expect(byId.alex.isMetaClick).toBe(true);
    expect(byId.alex.isReferral).toBe(true);
    expect(byId.alex.sourceKind).toBe("meta_click_referral");
    expect(byId.alex.referralCode).toBe("KRISTEN25");
    expect(byId.alex.referralAdvocateFirstName).toBe("Kristen");
    expect(quizLeadSourceLabel(byId.alex)).toBe("Meta link · Kristen");

    expect(byId.jennifer.isMeta).toBe(false);
    expect(byId.jennifer.isReferral).toBe(true);
    expect(byId.jennifer.sourceKind).toBe("referral");
    expect(quizLeadSourceLabel(byId.jennifer)).toBe("Referral · Megan");

    expect(byId["pixel-only"].isMeta).toBe(false);
    expect(byId["pixel-only"].isMetaClick).toBe(false);
    expect(byId["pixel-only"].sourceKind).toBe("organic");
    expect(quizLeadSourceLabel(byId["pixel-only"])).toBe("Organic");
  });

  it("filters Ad to campaign UTMs only; Referral keeps promo and quiz referred_by", () => {
    expect(filterQuizLeads(rows, "all").map((r) => r.id)).toEqual([
      "ellie",
      "organic-unpaid",
      "organic-paid",
      "alex",
      "jennifer",
      "pixel-only",
    ]);
    expect(filterQuizLeads(rows, "meta").map((r) => r.id)).toEqual(["ellie"]);
    expect(filterQuizLeads(rows, "referral").map((r) => r.id)).toEqual(["alex", "jennifer"]);
    expect(filterQuizLeads(rows, "no_account").map((r) => r.id)).toEqual(["ellie", "pixel-only"]);
    expect(filterQuizLeads(rows, "signed_up_unpaid").map((r) => r.id)).toEqual(["organic-unpaid"]);
    expect(filterQuizLeads(rows, "paid").map((r) => r.id)).toEqual(["organic-paid", "alex", "jennifer"]);
  });
});

describe("lead display helpers", () => {
  it("names from first+last, else email local-part", () => {
    expect(leadDisplayName(lead())).toBe("Dolly Chammas");
    expect(leadDisplayName(lead({ first_name: "", last_name: "", email: "pgchammas+demo@gmail.com" })))
      .toBe("pgchammas+demo");
  });

  it("formats macros on one compact line and PT time", () => {
    expect(formatMacroRanges(lead())).toBe("110–130P · 140–180C · 50–65F · 1800–2000 cal");
    expect(formatMacroRanges(lead({
      protein_low_g: null,
      protein_high_g: null,
      carbs_low_g: null,
      carbs_high_g: null,
      fat_low_g: null,
      fat_high_g: null,
      calories_low: null,
      calories_high: null,
    }))).toBe("");
    expect(formatLeadWhen("2026-08-19T18:30:00.000Z")).toBe("Aug 19, 11:30 AM PT");
  });

  it("surfaces pregnant / vegan / early-PP tags Callie actually uses", () => {
    expect(formatLeadTags(lead({ segment: "pregnancy_nurture", flags: ["vegan"] })))
      .toBe("Pregnant · Vegan");
    expect(formatLeadTags(lead({ segment: "early_pp_nurture", flags: ["c_section"], needs_review: true })))
      .toBe("Early PP · C-section · Needs review");
    expect(formatLeadTags(lead({ months_postpartum: "still_pregnant", flags: ["none"] })))
      .toBe("Pregnant");
  });
});

function insightMap(leadRow) {
  return Object.fromEntries(leadInsightRows(leadRow).map((row) => [row.label, row.value]));
}

describe("leadInsightRows", () => {
  it("quiz-only lead shows quiz + landing + campaign and no account rows", () => {
    const byLabel = insightMap(lead({
      created_at: "2026-08-19T18:30:00.000Z",
      landing_path: "/quiz",
      utm_source: "meta",
      utm_medium: "cpc",
      utm_campaign: "aug_founding",
      utm_content: "story_1",
      months_postpartum: "3_12_months",
      feeding_status: "exclusive",
      flags: ["vegan"],
      segment: "waitlist_plantbased",
      funnelStatus: "quiz_only",
      profileId: null,
    }));
    expect(byLabel["Quiz completed"]).toBe("Aug 19, 11:30 AM PT");
    expect(byLabel.Landing).toBe("/quiz");
    expect(byLabel.Campaign).toBe("meta / cpc / aug_founding / story_1");
    expect(byLabel.Source).toBe("Meta ad");
    expect(byLabel.Tags).toBe("Plant-based · Vegan");
    expect(byLabel.Postpartum).toBe("3–12 months");
    expect(byLabel.Feeding).toBe("Exclusive breast milk");
    expect(byLabel["Account created"]).toBeUndefined();
    expect(byLabel.Paid).toBeUndefined();
    expect(Object.values(byLabel).join(" ")).not.toMatch(/fbp|fbc|event_id|visit/i);
  });

  it("paid lead also shows account + paid timestamps", () => {
    const byLabel = insightMap(lead({
      created_at: "2026-08-18T16:00:00.000Z",
      referred_by: "Sarah",
      funnelStatus: "paid",
      profileId: MEGAN,
      profileCreatedAt: "2026-08-18T17:00:00.000Z",
      profilePaidAt: "2026-08-18T18:00:00.000Z",
    }));
    expect(byLabel["Quiz completed"]).toBe("Aug 18, 9:00 AM PT");
    expect(byLabel.Source).toBe("Referral · Sarah");
    expect(byLabel["Referred by"]).toBeUndefined();
    expect(byLabel["Account created"]).toBe("Aug 18, 10:00 AM PT");
    expect(byLabel.Paid).toBe("Aug 18, 11:00 AM PT");
  });

  it("signed-up unpaid shows account created and signed up, unpaid", () => {
    const byLabel = insightMap(lead({
      funnelStatus: "signed_up_unpaid",
      profileId: MEGAN,
      profileCreatedAt: "2026-08-18T17:00:00.000Z",
    }));
    expect(byLabel["Account created"]).toBe("Aug 18, 10:00 AM PT");
    expect(byLabel.Paid).toBe("Signed up, unpaid");
  });

  it("omits missing UTMs, landing path, and review when nothing is stored", () => {
    const rows = leadInsightRows(lead({
      landing_path: "",
      utm_source: null,
      utm_medium: "  ",
      utm_campaign: null,
      utm_content: "",
      months_postpartum: "",
      feeding_status: null,
      needs_review: false,
      review_reason: "thyroid",
      protein_low_g: null,
      protein_high_g: null,
      carbs_low_g: null,
      carbs_high_g: null,
      fat_low_g: null,
      fat_high_g: null,
      calories_low: null,
      calories_high: null,
    }));
    const labels = rows.map((row) => row.label);
    expect(labels).toContain("Quiz completed");
    expect(labels).toContain("Source");
    expect(labels).not.toContain("Landing");
    expect(labels).not.toContain("Campaign");
    expect(labels).not.toContain("Account created");
    expect(labels).not.toContain("Paid");
    expect(labels).not.toContain("Review");
    expect(labels).not.toContain("Postpartum");
    expect(labels).not.toContain("Feeding");
    expect(labels).not.toContain("Ranges");
    expect(formatLeadCampaign(lead({ utm_source: "meta", utm_content: "story_1" })))
      .toBe("meta / story_1");
    expect(rows.some((row) => /0 visits|visit count/i.test(`${row.label} ${row.value}`))).toBe(false);
  });

  it("shows review reason only when needs_review is set", () => {
    expect(insightMap(lead({ needs_review: true, review_reason: "carbs_under_100" })).Review)
      .toBe("Carbs under 100");
    expect(insightMap(lead({ needs_review: false, review_reason: "carbs_under_100" })).Review)
      .toBeUndefined();
  });
});

function mockClient({ leads = [], profiles = [], referrals = [], error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = {
        table,
        select(cols) {
          q.cols = cols;
          return q;
        },
        order(col, opts) {
          q.order = { col, ...opts };
          return q;
        },
        then(resolve) {
          calls.push({ table: q.table, cols: q.cols, order: q.order });
          const data = q.table === "marketing_leads"
            ? leads
            : q.table === "referrals"
              ? referrals
              : profiles;
          resolve({ data, error });
        },
      };
      return q;
    },
  };
}

describe("loadQuizLeads", () => {
  it("loads marketing_leads newest first and joins profiles + referrals in JS by email", async () => {
    const client = mockClient({
      leads: [lead({ id: "joined", email: "Mama@example.com", fbc: "fb.1.1.abc", referred_by: null })],
      profiles: [
        { id: MEGAN, email: "mama@example.com", role: "client", paid: false, name: "Mama" },
        { id: KRISTEN, email: "kristen@example.com", role: "client", paid: true, name: "Kristen" },
      ],
      referrals: [{
        referred_email: "mama@example.com",
        referred_user_id: MEGAN,
        advocate_user_id: KRISTEN,
        code: "KRISTEN25",
        status: "paid",
        created_at: "2026-08-18T12:00:00.000Z",
      }],
    });
    const rows = await loadQuizLeads({ client });
    expect(client.calls[0]).toEqual({
      table: "marketing_leads",
      cols: expect.stringContaining("email"),
      order: { col: "created_at", ascending: false },
    });
    expect(client.calls[0].cols).toEqual(expect.stringContaining("landing_path"));
    expect(client.calls[0].cols).toEqual(expect.stringContaining("review_reason"));
    expect(client.calls[0].cols).not.toMatch(/\bvisits?\b/);
    expect(client.calls.map((c) => c.table).sort()).toEqual(["marketing_leads", "profiles", "referrals"]);
    expect(client.calls.find((c) => c.table === "referrals").cols).toEqual(expect.stringContaining("referred_email"));
    expect(rows).toHaveLength(1);
    expect(rows[0].profileId).toBe(MEGAN);
    expect(rows[0].funnelStatus).toBe("signed_up_unpaid");
    expect(rows[0].sourceKind).toBe("meta_click_referral");
    expect(rows[0].referralAdvocateFirstName).toBe("Kristen");
    expect(quizLeadSourceLabel(rows[0])).toBe("Meta link · Kristen");
  });
});
