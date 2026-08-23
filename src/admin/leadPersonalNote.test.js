import { describe, expect, it } from "vitest";
import {
  MAILTO_MAX_LEN,
  PAID_NOTE_COPY,
  INVITE_GUIDE_LINE,
  INVITE_JOIN_LINE,
  PERSONAL_NOTE_SUBJECT,
  draftLeadPersonalNote,
  formatPersonalNoteCopy,
  isSoftPitchLead,
  isStillBreastfeeding,
  leadNoteFirstName,
  personalNoteMailtoHref,
  pickLeadObservation,
  pickPersonalConnection,
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

function assertSharedVoice(draft, firstName) {
  const hay = `${draft.subject}\n${draft.body}\n${draft.copyText}`;
  for (const re of BANNED) {
    expect(hay).not.toMatch(re);
  }
  expect(draft.body).toMatch(/^Hi, /);
  expect(draft.body).toContain(`Hi, ${firstName}!`);
  expect(draft.body).toContain("I'm sure you've gotten some automated emails from me.");
  expect(draft.body).toContain(`This is me, Callie writing a personal message to you, ${firstName}!`);
  expect(draft.body).toMatch(/\nCallie\s*$/);
  expect(draft.body).not.toMatch(/—/);
  expect(draft.body).not.toMatch(/not feeding breast milk/i);
  expect(draft.body).not.toMatch(/doors close/i);
}

function assertInviteVoice(draft, firstName) {
  assertSharedVoice(draft, firstName);
  expect(draft.body).toContain("I too have felt");
  expect(draft.body).toContain("That's why I built this program.");
  expect(draft.body).toContain(INVITE_GUIDE_LINE);
  expect(draft.body).toContain(INVITE_JOIN_LINE);
  expect(draft.body).not.toMatch(/August 31st/);
  expect(draft.body).not.toMatch(/I'd love to have you join/);
}

function assertSoftVoice(draft, firstName) {
  assertSharedVoice(draft, firstName);
  expect(draft.body).toMatch(/may not be the right fit/);
  expect(draft.body).toMatch(/I'll tell you when it is/);
  expect(draft.body).not.toContain(INVITE_JOIN_LINE);
  expect(draft.body).not.toContain(INVITE_GUIDE_LINE);
  expect(draft.body).not.toMatch(/Registration closes/);
  expect(draft.body).not.toMatch(/I'd love to have you join/);
}

describe("leadNoteFirstName", () => {
  it("uses the quiz first name and falls back to mama", () => {
    expect(leadNoteFirstName(lead({ first_name: "Ellie Rose" }))).toBe("Ellie");
    expect(leadNoteFirstName(lead({ first_name: "" }))).toBe("mama");
    expect(leadNoteFirstName(lead({ first_name: "7mama" }))).toBe("mama");
  });
});

describe("pickLeadObservation", () => {
  it("picks breastfeeding, postpartum season, or weight, never what she is not doing", () => {
    const pregnant = pickLeadObservation(lead({
      months_postpartum: "still_pregnant",
      segment: "pregnancy_nurture",
    }));
    const exclusive = pickLeadObservation(lead({
      months_postpartum: "0_3_months",
      feeding_status: "exclusive",
    }));
    const earlyPp = pickLeadObservation(lead({
      months_postpartum: "0_3_months",
      feeding_status: "not_feeding",
      segment: "early_pp_nurture",
    }));
    const plant = pickLeadObservation(lead({
      months_postpartum: "3_12_months",
      flags: ["vegan"],
      segment: "waitlist_plantbased",
    }));
    const weight = pickLeadObservation(lead({
      feeding_status: "not_feeding",
      current_weight_lbs: 180,
      goal_weight_lbs: 155,
    }));

    expect(pregnant.key).toBe("pregnant");
    expect(pregnant.text).toMatch(/still pregnant/i);
    expect(exclusive.key).toBe("feeding_exclusive");
    expect(exclusive.text).toMatch(/exclusively breastfeeding/);
    expect(earlyPp.key).toBe("early_pp");
    expect(earlyPp.text).toMatch(/0–3 months/);
    expect(earlyPp.text).not.toMatch(/breast|feeding|milk/i);
    expect(plant.key).toBe("vegan");
    expect(plant.text).toMatch(/fully vegan/i);
    expect(weight.key).toBe("weight_lose");
    expect(weight.text).toMatch(/lose about 25 pounds/);

    const keys = [pregnant, exclusive, earlyPp, plant, weight].map((row) => row.key);
    expect(new Set(keys).size).toBe(5);
    for (const text of [pregnant, exclusive, earlyPp, plant, weight].map((row) => row.text)) {
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(/not feeding/i);
    }
  });
});

describe("pickPersonalConnection", () => {
  it("pairs one I-too-have-felt line with the observation", () => {
    expect(pickPersonalConnection("feeding_exclusive")).toMatch(/while you're still feeding/);
    expect(pickPersonalConnection("pp_3_12")).toMatch(/inflamed, soft, and lethargic/);
    expect(pickPersonalConnection("weight_lose")).toMatch(/giving everything away/);
    expect(pickPersonalConnection("fallback")).toMatch(/pouring into everyone else/);
    expect(pickPersonalConnection("feeding_exclusive")).toMatch(/That's why I built this program/);
  });
});

describe("draftLeadPersonalNote", () => {
  it("drafts Callie's short invite for an exclusively breastfeeding lead", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Nora",
      months_postpartum: "0_3_months",
      segment: "early_pp_nurture",
      feeding_status: "exclusive",
    }));
    expect(draft.kind).toBe("draft");
    expect(draft.subject).toBe(PERSONAL_NOTE_SUBJECT);
    expect(draft.observationKey).toBe("feeding_exclusive");
    expect(draft.pitch).toBe("invite");
    expect(draft.body).toMatch(/exclusively breastfeeding/);
    expect(draft.body).toMatch(/I too have felt how hard it is to take care of yourself while you're still feeding/);
    expect(draft.body).not.toMatch(/0–3 months/);
    expect(draft.body).not.toMatch(/I'm still breastfeeding too/);
    expect(draft.body).not.toMatch(/8 month old/);
    expect(draft.body).not.toMatch(/may not be the right fit/);
    expect(isStillBreastfeeding(lead({
      months_postpartum: "0_3_months",
      feeding_status: "exclusive",
    }))).toBe(true);
    expect(draft.copyText).toBe(formatPersonalNoteCopy({
      subject: draft.subject,
      body: draft.body,
    }));
    assertInviteVoice(draft, "Nora");
  });

  it("drafts a soft note for pregnancy nurture with no Thursday join pitch", () => {
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
    expect(draft.body).toMatch(/still pregnant/);
    expect(draft.body).not.toMatch(/I'm still breastfeeding too/);
    assertSoftVoice(draft, "Priya");
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
    assertSoftVoice(draft, "Ellie");
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
    expect(draft.body).toMatch(/I too have felt inflamed, soft, and lethargic after having my babies/);
    expect(draft.body).not.toMatch(/breastfeed/i);
    expect(draft.body).not.toMatch(/breast milk/i);
    expect(draft.body).not.toMatch(/not feeding/i);
    expect(draft.body).not.toMatch(/I'm still breastfeeding too/);
    assertInviteVoice(draft, "Patty");
  });

  it("uses early postpartum when she is newly postpartum and not feeding", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Sam",
      months_postpartum: "0_3_months",
      feeding_status: "not_feeding",
      flags: ["c_section"],
      segment: "early_pp_nurture",
    }));
    expect(draft.observationKey).toBe("early_pp");
    expect(draft.pitch).toBe("invite");
    expect(draft.body).toMatch(/0–3 months postpartum/);
    expect(draft.body).not.toMatch(/C-section|c-section/);
    expect(draft.body).not.toMatch(/breast|feeding|milk/i);
    assertInviteVoice(draft, "Sam");
  });

  it("uses 1–2 years postpartum instead of a thyroid hook", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Tess",
      months_postpartum: "1_2_years",
      flags: ["thyroid"],
      segment: "main",
    }));
    expect(draft.observationKey).toBe("pp_1_2");
    expect(draft.pitch).toBe("invite");
    expect(draft.body).toMatch(/1–2 years postpartum/);
    expect(draft.body).not.toMatch(/thyroid/);
    assertInviteVoice(draft, "Tess");
  });

  it("uses the weight goal when there is no feeding or season hook", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Elle",
      feeding_status: "not_feeding",
      current_weight_lbs: 180,
      goal_weight_lbs: 155,
    }));
    expect(draft.observationKey).toBe("weight_lose");
    expect(draft.body).toMatch(/looking to lose about 25 pounds/);
    expect(draft.body).toMatch(/I too have felt like I was giving everything away/);
    expect(draft.body).not.toMatch(/breast|feeding|milk/i);
    assertInviteVoice(draft, "Elle");
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
    expect(JSON.stringify(draft)).not.toMatch(/Registration closes/);
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

  it("uses the feeding connection for combination feeding too", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Ava",
      months_postpartum: "3_12_months",
      feeding_status: "combination",
    }));
    expect(draft.observationKey).toBe("feeding_combination");
    expect(draft.body).toMatch(/combining breast milk and formula/);
    expect(draft.body).toMatch(/I too have felt how hard it is to take care of yourself while you're still feeding/);
    expect(draft.body).not.toMatch(/I'm still breastfeeding too/);
    expect(draft.body).not.toMatch(/8 month old/);
    expect(draft.body).not.toMatch(/—/);
    assertInviteVoice(draft, "Ava");
  });

  it("uses the feeding connection for weaning", () => {
    const draft = draftLeadPersonalNote(lead({
      first_name: "Leah",
      feeding_status: "weaning",
    }));
    expect(draft.observationKey).toBe("feeding_weaning");
    expect(draft.body).toMatch(/I saw you're weaning/);
    expect(draft.body).toMatch(/while you're still feeding/);
    assertInviteVoice(draft, "Leah");
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
