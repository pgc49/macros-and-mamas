import { describe, expect, it } from "vitest";
import {
  MAILTO_MAX_LEN,
  PAID_NOTE_COPY,
  INVITE_JOIN_LINE,
  PERSONAL_NOTE_SUBJECT,
  draftLeadPersonalNote,
  formatPersonalNoteCopy,
  isSoftPitchLead,
  isStillBreastfeeding,
  leadNoteFirstName,
  personalNoteMailtoHref,
  pickLeadObservation,
} from "./leadPersonalNote.js";

function lead(over = {}) {
  return {
    id: "lead-1",
    email: "mama@example.com",
    first_name: "Dolly",
    last_name: "Chammas",
    funnelStatus: "quiz_only",
    flags: [],
    segment: "main",
    ...over,
  };
}

const BANNED = [
  /i hope this email finds you well/i,
  /holistic nutritionist/i,
  /limited spots remaining/i,
  /50 mamas/i,
  /months_postpartum/,
  /feeding_status/,
  /waitlist_plantbased/,
  /pregnancy_nurture/,
  /early_pp_nurture/,
];

function assertVoice(draft) {
  const hay = `${draft.subject}\n${draft.body}\n${draft.copyText}`;
  for (const re of BANNED) {
    expect(hay).not.toMatch(re);
  }
  expect(draft.body).toMatch(/Callie\s*$/);
  expect(draft.body).toMatch(/You've probably gotten some automated emails from me/);
  expect(draft.body).toMatch(/I wanted to reach out personally/);
  expect(draft.body).toMatch(/Reply anytime if you have a question about the program/);
  expect(draft.body).not.toMatch(/—/);
  expect(draft.body).not.toMatch(/not feeding breast milk/i);
  expect(draft.body).not.toMatch(/doors close/i);
}

describe("leadNoteFirstName", () => {
  it("uses the quiz first name and falls back to mama", () => {
    expect(leadNoteFirstName(lead({ first_name: "Ellie Rose" }))).toBe("Ellie");
    expect(leadNoteFirstName(lead({ first_name: "" }))).toBe("mama");
    expect(leadNoteFirstName(lead({ first_name: "7mama" }))).toBe("mama");
  });
});

describe("pickLeadObservation", () => {
  it("gives pregnant, early-PP, C-section, thyroid, and plant-based distinct observations", () => {
    const pregnant = pickLeadObservation(lead({
      months_postpartum: "still_pregnant",
      segment: "pregnancy_nurture",
    }));
    const earlyPp = pickLeadObservation(lead({
      months_postpartum: "0_3_months",
      segment: "early_pp_nurture",
    }));
    const cSection = pickLeadObservation(lead({
      months_postpartum: "0_3_months",
      flags: ["c_section"],
    }));
    const thyroid = pickLeadObservation(lead({
      months_postpartum: "3_12_months",
      flags: ["thyroid"],
    }));
    const plant = pickLeadObservation(lead({
      months_postpartum: "3_12_months",
      flags: ["vegan"],
      segment: "waitlist_plantbased",
    }));

    expect(pregnant.key).toBe("pregnant");
    expect(pregnant.text).toMatch(/still pregnant/i);
    expect(earlyPp.key).toBe("early_pp");
    expect(earlyPp.text).toMatch(/0–3 months/i);
    expect(cSection.key).toBe("c_section");
    expect(cSection.text).toMatch(/C-section/);
    expect(thyroid.key).toBe("thyroid");
    expect(thyroid.text).toMatch(/thyroid/i);
    expect(plant.key).toBe("vegan");
    expect(plant.text).toMatch(/fully vegan/i);

    const keys = [pregnant, earlyPp, cSection, thyroid, plant].map((row) => row.key);
    expect(new Set(keys).size).toBe(5);
    const texts = [pregnant, earlyPp, cSection, thyroid, plant].map((row) => row.text);
    expect(new Set(texts).size).toBe(5);
    for (const text of texts) {
      expect(text).not.toMatch(/—/);
    }
  });
});

describe("draftLeadPersonalNote", () => {
  it("drafts an invite for an eligible early-PP lead", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Nora",
      months_postpartum: "0_3_months",
      segment: "early_pp_nurture",
      feeding_status: "exclusive",
    }));
    expect(draft.kind).toBe("draft");
    expect(draft.subject).toBe(PERSONAL_NOTE_SUBJECT);
    expect(draft.observationKey).toBe("early_pp");
    expect(draft.pitch).toBe("invite");
    expect(draft.body).toMatch(/^Hi Nora,/);
    expect(draft.body).toMatch(/0–3 months/);
    expect(draft.body).toMatch(/I'd love to have you join/);
    expect(draft.body).toContain(INVITE_JOIN_LINE);
    expect(draft.body).toMatch(/August 31st/);
    expect(draft.body).toMatch(/this Thursday/);
    expect(draft.body).toMatch(/Reply anytime if you have a question about the program/);
    expect(draft.body).toMatch(/I'm still breastfeeding too/);
    expect(draft.body).toMatch(/8 month old/);
    expect(draft.body).toMatch(/4 year old/);
    expect(draft.body).toMatch(/pour back into your own cup/);
    expect(draft.body).toMatch(/giving their all to their children and families/);
    expect(draft.body).toMatch(/but it's okay to put time into yourself/);
    expect(draft.body).not.toMatch(/you still need to/);
    expect(draft.body).not.toMatch(/and their work/);
    expect(draft.body).not.toMatch(/may not be the right fit/);
    expect(isStillBreastfeeding(lead({
      months_postpartum: "0_3_months",
      feeding_status: "exclusive",
    }))).toBe(true);
    expect(draft.copyText).toBe(formatPersonalNoteCopy({
      subject: draft.subject,
      body: draft.body,
    }));
    assertVoice(draft);
  });

  it("drafts a soft note for pregnancy nurture — no Aug 27 join pitch", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Priya",
      months_postpartum: "still_pregnant",
      segment: "pregnancy_nurture",
    }));
    expect(draft.kind).toBe("draft");
    expect(draft.observationKey).toBe("pregnant");
    expect(draft.pitch).toBe("soft");
    expect(isSoftPitchLead(lead({
      months_postpartum: "still_pregnant",
      segment: "pregnancy_nurture",
    }))).toBe(true);
    expect(draft.body).toMatch(/^Hi Priya,/);
    expect(draft.body).toMatch(/still pregnant/);
    expect(draft.body).toMatch(/may not be the right fit/);
    expect(draft.body).toMatch(/I'll tell you when it is/);
    expect(draft.body).toMatch(/Reply anytime if you have a question about the program/);
    expect(draft.body).not.toMatch(/Doors close/);
    expect(draft.body).not.toMatch(/August 31st/);
    expect(draft.body).not.toMatch(/I'd love to have you join/);
    expect(draft.body).not.toMatch(/I'm still breastfeeding too/);
    expect(draft.body).not.toMatch(/pour back into your own cup/);
    assertVoice(draft);
  });

  it("drafts a soft note for plant-based waitlist with a vegan observation", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Ellie",
      months_postpartum: "3_12_months",
      flags: ["vegan"],
      segment: "waitlist_plantbased",
    }));
    expect(draft.observationKey).toBe("vegan");
    expect(draft.pitch).toBe("soft");
    expect(draft.body).toMatch(/fully vegan/);
    expect(draft.body).toMatch(/may not be the right fit/);
    expect(draft.body).not.toMatch(/Doors close/);
    expect(draft.body).not.toMatch(/August 31st/);
    assertVoice(draft);
  });

  it("uses a C-section observation when that flag is present", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Maya",
      months_postpartum: "0_3_months",
      flags: ["c_section"],
      segment: "early_pp_nurture",
    }));
    expect(draft.observationKey).toBe("c_section");
    expect(draft.pitch).toBe("invite");
    expect(draft.body).toMatch(/C-section/);
    expect(draft.body).toContain(INVITE_JOIN_LINE);
    expect(draft.body).not.toMatch(/0–3 months/);
    assertVoice(draft);
  });

  it("uses a thyroid observation when that flag is present", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Tess",
      months_postpartum: "3_12_months",
      flags: ["thyroid"],
      segment: "main",
    }));
    expect(draft.observationKey).toBe("thyroid");
    expect(draft.pitch).toBe("invite");
    expect(draft.body).toMatch(/thyroid/);
    expect(draft.body).toContain(INVITE_JOIN_LINE);
    assertVoice(draft);
  });

  it("does not mention breastfeeding when she is not feeding", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Patty",
      months_postpartum: "3_12_months",
      feeding_status: "not_feeding",
      segment: "main",
    }));
    expect(draft.observationKey).toBe("pp_3_12");
    expect(draft.body).toMatch(/3–12 months postpartum/);
    expect(draft.body).toContain(INVITE_JOIN_LINE);
    expect(draft.body).not.toMatch(/breastfeed/i);
    expect(draft.body).not.toMatch(/breast milk/i);
    expect(draft.body).not.toMatch(/not feeding/i);
    expect(draft.body).not.toMatch(/I'm still breastfeeding too/);
    assertVoice(draft);
  });

  it("returns no join pitch for a paid lead", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Megan",
      funnelStatus: "paid",
      profilePaidAt: "2026-08-18T18:00:00.000Z",
      months_postpartum: "3_12_months",
      flags: ["thyroid"],
    }));
    expect(draft).toEqual({ kind: "paid", message: PAID_NOTE_COPY });
    expect(draft.message).toMatch(/already in/i);
    expect(JSON.stringify(draft)).not.toMatch(/August 27/);
    expect(JSON.stringify(draft)).not.toMatch(/I'd love to have you join/);
  });

  it("stays a short letter and signs Callie", () => {
    const draft = draftLeadPersonalNote(lead({
      months_postpartum: "3_12_months",
      feeding_status: "exclusive",
    }));
    const sentences = draft.body.split(/(?<=[.!?])\s+/).filter((s) => /[.!?]/.test(s));
    expect(sentences.length).toBeGreaterThanOrEqual(6);
    expect(sentences.length).toBeLessThanOrEqual(14);
    expect(draft.body).toMatch(/\nCallie\s*$/);
    expect(draft.body).not.toMatch(/—/);
  });

  it("adds Callie's breastfeeding note for combination feeding too", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Ava",
      months_postpartum: "3_12_months",
      feeding_status: "combination",
    }));
    expect(draft.observationKey).toBe("feeding_combination");
    expect(draft.body).toMatch(/I'm still breastfeeding too/);
    expect(draft.body).toMatch(/8 month old/);
    expect(draft.body).not.toMatch(/—/);
    assertVoice(draft);
  });
});

describe("personalNoteMailtoHref", () => {
  it("prefills subject and body", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Nora",
      months_postpartum: "0_3_months",
    }));
    const href = personalNoteMailtoHref("nora@example.com", draft);
    expect(href.startsWith("mailto:nora@example.com?")).toBe(true);
    expect(href).toContain(`subject=${encodeURIComponent(PERSONAL_NOTE_SUBJECT)}`);
    expect(href).toContain(`body=${encodeURIComponent(draft.body)}`);
    expect(href.length).toBeLessThanOrEqual(MAILTO_MAX_LEN);
  });

  it("drops body when the mailto would be too long", () => {
    const draft = draftLeadPersonalNote(lead({ first_name: "Nora", months_postpartum: "0_3_months" }));
    const href = personalNoteMailtoHref("nora@example.com", draft, { maxLen: 80 });
    expect(href).toBe(`mailto:nora@example.com?subject=${encodeURIComponent(PERSONAL_NOTE_SUBJECT)}`);
    expect(href).not.toContain("body=");
  });

  it("returns empty for paid drafts or a bad address", () => {
    expect(personalNoteMailtoHref("nora@example.com", { kind: "paid", message: PAID_NOTE_COPY })).toBe("");
    expect(personalNoteMailtoHref("not-an-email", draftLeadPersonalNote(lead()))).toBe("");
  });
});
