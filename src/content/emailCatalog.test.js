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

describe("comp migration lock", () => {
  it("freezes profiles.comp for non-admin clients", () => {
    const sql = readFileSync("supabase/migrations/061_comp_members.sql", "utf8");
    expect(sql).toMatch(/add column if not exists comp boolean not null default false/);
    expect(sql).toMatch(/new\.comp := old\.comp/);
    expect(sql).toMatch(/new\.comp := false/);
    expect(sql).not.toMatch(/@|gmail\.com/i);
  });
});
