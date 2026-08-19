import { describe, expect, it } from "vitest";
import {
  enrichQuizLeads,
  filterQuizLeads,
  formatLeadTags,
  formatLeadWhen,
  formatMacroRanges,
  isMetaLead,
  leadDisplayName,
  loadQuizLeads,
  quizLeadFunnelLabel,
  quizLeadFunnelStatus,
  quizLeadSourceKind,
  quizLeadSourceLabel,
} from "./quizLeads";

const MEGAN = "11111111-1111-4111-8111-111111111111";

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

describe("isMetaLead", () => {
  it("treats fbc or fbp as Meta even without utm", () => {
    expect(isMetaLead(lead({ fbc: "fb.1.1.abc" }))).toBe(true);
    expect(isMetaLead(lead({ fbp: "fb.1.1.xyz" }))).toBe(true);
  });

  it("treats facebook/ig/instagram/fb/meta utm_source as Meta, case-insensitive", () => {
    for (const utm of ["facebook", "IG", "Instagram", "fb", "Meta"]) {
      expect(isMetaLead(lead({ utm_source: utm }))).toBe(true);
    }
  });

  it("does not invent Meta from empty cookies, google utm, or a missing fbclid", () => {
    expect(isMetaLead(lead())).toBe(false);
    expect(isMetaLead(lead({ fbp: "  ", fbc: "" }))).toBe(false);
    expect(isMetaLead(lead({ utm_source: "google" }))).toBe(false);
    expect(isMetaLead(lead({ fbclid: "abc" }))).toBe(false);
  });
});

describe("quizLeadSourceKind", () => {
  it("labels Meta vs referral vs organic, with Meta winning", () => {
    expect(quizLeadSourceKind(lead({ fbc: "fb.1.1.abc" }))).toBe("meta");
    expect(quizLeadSourceKind(lead({ referred_by: "Sarah", fbc: "fb.1.1.abc" }))).toBe("meta");
    expect(quizLeadSourceKind(lead({ referred_by: "Sarah" }))).toBe("referral");
    expect(quizLeadSourceKind(lead())).toBe("organic");
    expect(quizLeadSourceLabel(lead({ referred_by: "Sarah" }))).toBe("Referral · Sarah");
    expect(quizLeadSourceLabel(lead({ fbp: "fb.1.1.xyz" }))).toBe("Meta");
    expect(quizLeadSourceLabel(lead())).toBe("Organic");
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
    lead({ id: "meta-quiz", email: "quiz@example.com", fbc: "fb.1.1.abc" }),
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
  ];
  const profiles = [
    { id: "admin", email: "quiz@example.com", role: "admin", paid: true },
    { id: "unpaid-id", email: "unpaid@example.com", role: "client", paid: false },
    { id: "paid-id", email: "PAID@example.com", role: "client", paid: true },
  ];
  const rows = enrichQuizLeads(leads, profiles);

  it("joins profiles on lower(email) and skips admin rows", () => {
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["meta-quiz"].funnelStatus).toBe("quiz_only");
    expect(byId["meta-quiz"].profileId).toBe(null);
    expect(byId["meta-quiz"].isMeta).toBe(true);
    expect(byId["organic-unpaid"].funnelStatus).toBe("signed_up_unpaid");
    expect(byId["organic-unpaid"].profileId).toBe("unpaid-id");
    expect(byId["organic-paid"].funnelStatus).toBe("paid");
    expect(byId["organic-paid"].sourceKind).toBe("organic");
  });

  it("filters All / Meta / no account / signed up unpaid / paid", () => {
    expect(filterQuizLeads(rows, "all").map((r) => r.id)).toEqual([
      "meta-quiz",
      "organic-unpaid",
      "organic-paid",
    ]);
    expect(filterQuizLeads(rows, "meta").map((r) => r.id)).toEqual(["meta-quiz"]);
    expect(filterQuizLeads(rows, "no_account").map((r) => r.id)).toEqual(["meta-quiz"]);
    expect(filterQuizLeads(rows, "signed_up_unpaid").map((r) => r.id)).toEqual(["organic-unpaid"]);
    expect(filterQuizLeads(rows, "paid").map((r) => r.id)).toEqual(["organic-paid"]);
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

function mockClient({ leads = [], profiles = [], error = null } = {}) {
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
          const data = q.table === "marketing_leads" ? leads : profiles;
          resolve({ data, error });
        },
      };
      return q;
    },
  };
}

describe("loadQuizLeads", () => {
  it("loads marketing_leads newest first and joins profiles in JS by email", async () => {
    const client = mockClient({
      leads: [lead({ id: "joined", email: "Mama@example.com" })],
      profiles: [{ id: MEGAN, email: "mama@example.com", role: "client", paid: false }],
    });
    const rows = await loadQuizLeads({ client });
    expect(client.calls[0]).toEqual({
      table: "marketing_leads",
      cols: expect.stringContaining("email"),
      order: { col: "created_at", ascending: false },
    });
    expect(client.calls[1].table).toBe("profiles");
    expect(rows).toHaveLength(1);
    expect(rows[0].profileId).toBe(MEGAN);
    expect(rows[0].funnelStatus).toBe("signed_up_unpaid");
    expect(rows[0].sourceKind).toBe("organic");
  });
});
