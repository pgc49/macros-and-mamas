import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMAIL_CATALOG, EMAIL_JOURNEYS, catalogByJourney, catalogNumberLabel } from "./emailCatalog.js";

/** Operational / post-pay copy — not Callie-approved sales or quiz emails. */
const PRODUCT_COMMS_IDS = new Set(["welcome", "intake_received", "macros_live"]);

describe("product comms emails", () => {
  it("no longer mention WhatsApp or ship a WhatsApp link", () => {
    for (const row of EMAIL_CATALOG.filter((e) => PRODUCT_COMMS_IDS.has(e.id))) {
      expect(row.bodyPreview, row.id).not.toMatch(/whatsapp|chat\.whatsapp/i);
    }
    const macros = EMAIL_CATALOG.find((e) => e.id === "macros_live");
    expect(macros.bodyPreview).toMatch(/Open Messages/);
  });
});

describe("unpaid sales catalog", () => {
  it("keeps Track B commercial mail off WhatsApp and the hard 50-cap", () => {
    const unpaid = EMAIL_CATALOG.filter((e) => String(e.id).startsWith("finish_joining"));
    expect(unpaid).toHaveLength(3);
    for (const row of unpaid) {
      expect(row.bodyPreview, row.id).not.toMatch(/whatsapp/i);
      expect(row.bodyPreview, row.id).not.toMatch(/—/);
      expect(row.cta, row.id).not.toMatch(/—/);
      expect(row.bodyPreview, row.id).not.toMatch(/capped at 50/i);
      expect(row.bodyPreview, row.id).toMatch(/Unsubscribe/);
    }
    const ranges = EMAIL_CATALOG.find((e) => e.id === "quiz_ranges");
    expect(ranges.bodyPreview).not.toMatch(/capped at 50|50 spots|50 mamas/i);
    expect(ranges.bodyPreview).not.toMatch(/The group starts Monday, Aug 31/);
    expect(ranges.bodyPreview).not.toMatch(/Aug 27|Aug 31|August 31/);
    expect(ranges.bodyPreview).not.toMatch(/Doors close/i);
    expect(ranges.bodyPreview).not.toMatch(/enrollment is open/i);
    expect(ranges.bodyPreview).toMatch(/Callie builds every set of ranges by hand, in the order mamas lock in/);
    expect(ranges.bodyPreview).toMatch(/Use this same email so your ranges stay attached/);
  });
});

describe("quiz drip catalog", () => {
  it("adds the 1/3/7 sales follow-ups and a pregnancy-only soft note", () => {
    const ids = EMAIL_CATALOG.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining([
      "quiz_ranges",
      "quiz_drip_2d",
      "quiz_drip_7d",
      "quiz_pregnancy_note",
    ]));
    expect(ids).not.toContain("quiz_drip_1d");
    expect(ids).not.toContain("quiz_drip_3d");
    expect(ids).not.toContain("quiz_drip_plantbased");

    const pregnancy = EMAIL_CATALOG.find((e) => e.id === "quiz_pregnancy_note");
    expect(pregnancy.cta).toBeNull();
    expect(pregnancy.bodyPreview).not.toMatch(/\$249|lock in your spot|\/join/i);
    expect(pregnancy.trigger).toMatch(/plant-based/i);
    expect(pregnancy.subject).toBe("[First name], whenever you're ready");

    const day2 = EMAIL_CATALOG.find((e) => e.id === "quiz_drip_2d");
    expect(day2.cta).toMatch(/Finish signing up/);
    expect(day2.trigger).toMatch(/Track A/i);
    expect(day2.trigger).toMatch(/\+2 days/);
    expect(day2.subject).not.toMatch(/your ranges/i);
    expect(day2.bodyPreview).toMatch(/Your quiz rate is \$249/);
    expect(day2.bodyPreview).not.toMatch(/This group starts Monday, Aug 31/);
    expect(day2.bodyPreview).not.toMatch(/Aug 27|Aug 31|August 31/);
    expect(day2.bodyPreview).not.toMatch(/Doors close/i);
    expect(day2.bodyPreview).not.toMatch(/enrollment is open/i);
    expect(day2.bodyPreview).toMatch(/Callie builds every set of ranges by hand, in the order mamas lock in/);
    expect(day2.bodyPreview).toMatch(/Same email so your ranges stay attached/);

    const last = EMAIL_CATALOG.find((e) => e.id === "quiz_drip_7d");
    expect(last.status).toBe("live");
    expect(last.trigger).toMatch(/Aug 26/);
    expect(last.trigger).toMatch(/8:00 AM/);
    expect(last.trigger).toMatch(/Aug 27/);
    expect(last.bodyPreview).not.toMatch(/capped at 50/);
    expect(last.bodyPreview).toMatch(/later keeps not coming/);
    expect(last.bodyPreview).toMatch(/The group starts Monday, Aug 31/);
    expect(last.bodyPreview).not.toMatch(/Doors close Thursday/);
    expect(last.bodyPreview).not.toMatch(/Aug 27/);
    expect(last.bodyPreview).toMatch(/your spot is \$249/);
    expect(last.bodyPreview).toMatch(/Checkout offers 4 interest-free payments of \$62\.25/);

    const quizRanges = EMAIL_CATALOG.find((e) => e.id === "quiz_ranges");
    expect(quizRanges.bodyPreview).toMatch(/Checkout offers 4 interest-free payments of \$62\.25/);
    expect(day2.bodyPreview).toMatch(/Checkout offers 4 interest-free payments of \$62\.25/);
    expect(EMAIL_CATALOG.find((e) => e.id === "quiz_pregnancy_note").bodyPreview)
      .not.toMatch(/\$62\.25|split it/i);

    const finish = EMAIL_CATALOG.find((e) => e.id === "finish_joining_1h");
    expect(finish.trigger).toMatch(/Track B/);
    expect(finish.bodyPreview).toMatch(/Checkout offers 4 interest-free payments of \$62\.25/);
    expect(EMAIL_CATALOG.find((e) => e.id === "finish_joining_close").trigger).toMatch(/Aug 26/);
  });
});

describe("email catalog journey", () => {
  it("walks Quiz → unpaid signup → paid → other, then Callie separately", () => {
    expect(EMAIL_JOURNEYS.map((j) => j.id)).toEqual([
      "quiz",
      "unpaid",
      "paid",
      "other",
      "callie",
    ]);

    const journeys = catalogByJourney();
    expect(journeys[0].ids).toEqual([
      "quiz_ranges",
      "quiz_drip_2d",
      "quiz_drip_7d",
      "quiz_pregnancy_note",
    ]);
    expect(journeys[0].note).toMatch(/plant-based/i);
    expect(journeys[1].ids).toEqual([
      "finish_joining_1h",
      "finish_joining_24h",
      "finish_joining_close",
    ]);
    expect(journeys[2].ids).toEqual([
      "welcome",
      "intake_reminder",
      "intake_received",
      "macros_live",
    ]);
    expect(journeys[3].ids).toEqual(["eligibility_refund", "cohort_open", "quiz_one_more"]);
    expect(journeys[4].ids).toEqual([
      "callie_payment",
      "callie_intake",
      "callie_eligibility_hold",
      "callie_refund",
    ]);
    expect(journeys[4].note).toMatch(/not to mamas/i);

    const grouped = journeys.flatMap((j) => j.ids);
    expect(grouped.sort()).toEqual(EMAIL_CATALOG.map((e) => e.id).sort());
    expect(journeys.every((j) => j.templates.length === j.ids.length)).toBe(true);

    expect(catalogNumberLabel(EMAIL_CATALOG.find((e) => e.id === "welcome"))).toBe("#2");
    expect(EMAIL_CATALOG.find((e) => e.id === "welcome").trigger).toMatch(/complimentary/i);
    expect(catalogNumberLabel(EMAIL_CATALOG.find((e) => e.id === "quiz_drip_2d"))).toBe("Q2");
    expect(catalogNumberLabel(EMAIL_CATALOG.find((e) => e.id === "quiz_one_more"))).toBe("Q+");
    const oneMore = EMAIL_CATALOG.find((e) => e.id === "quiz_one_more");
    expect(oneMore.bodyPreview).toMatch(/you matter/i);
    expect(oneMore.bodyPreview).toMatch(/DMs are open, but course registration will close tonight/);
    expect(oneMore.bodyPreview).not.toMatch(/—/);
    expect(oneMore.trigger).toMatch(/Does not change Terms/);
  });

  it("keeps em dashes out of emails Callie sends to mamas", () => {
    const cotiQuote =
      "I've never been able to lose weight while nursing — with any of my children — until now.";
    const mamaFacing = EMAIL_CATALOG.filter((row) =>
      row.audience === "Client" || row.audience === "Lead" || row.audience === "Waitlist"
    );
    expect(mamaFacing.length).toBeGreaterThan(8);
    for (const row of mamaFacing) {
      expect(row.subject, row.id).not.toMatch(/—/);
      expect(String(row.bodyPreview || "").replaceAll(cotiQuote, ""), row.id).not.toMatch(/—/);
      if (row.cta) expect(row.cta, row.id).not.toMatch(/—/);
    }
  });

  it("keeps a full body preview on every live template", () => {
    for (const row of EMAIL_CATALOG) {
      expect(row.subject, row.id).toMatch(/\S/);
      expect(String(row.bodyPreview || "").trim().length, row.id).toBeGreaterThan(40);
    }
  });
});

describe("comp migration lock", () => {
  it("freezes profiles.comp for non-admin clients", () => {
    const sql = readFileSync("supabase/migrations/061_comp_members.sql", "utf8");
    expect(sql).toMatch(/add column if not exists comp boolean not null default false/);
    expect(sql).toMatch(/new\.comp := old\.comp/);
    expect(sql).toMatch(/new\.comp := false/);
    expect(sql).not.toMatch(/@|gmail\.com/i);
  });
});
