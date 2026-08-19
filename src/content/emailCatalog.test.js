import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMAIL_CATALOG } from "./emailCatalog.js";

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

    const finish = EMAIL_CATALOG.find((e) => e.id === "finish_joining");
    expect(finish.trigger).toMatch(/Track B/);
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
