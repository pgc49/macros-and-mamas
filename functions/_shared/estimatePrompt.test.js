import { describe, expect, it } from "vitest";
import { buildEstimateJsonSpec, buildEstimateLeadIn } from "./estimatePrompt.js";

const dolly = {
  name: "Dolly",
  breastfeeding: false,
  monthsPP: "",
  pregnant: false,
  goal: "lose",
};

describe("buildEstimateLeadIn", () => {
  it("does not brand every client as postpartum", () => {
    const lead = buildEstimateLeadIn(dolly);
    expect(lead).toMatch(/Macros and Mamas client/);
    expect(lead).toMatch(/women who are not postpartum/);
    expect(lead).toMatch(/Name: Dolly/);
    expect(lead).toMatch(/do NOT assume she is postpartum/);
    expect(lead).not.toMatch(/for a postpartum macro coaching program/);
  });
});

describe("buildEstimateJsonSpec", () => {
  it("grounds the tip in her profile instead of a postpartum slogan", () => {
    const spec = buildEstimateJsonSpec(dolly);
    expect(spec).toMatch(/never in a generic Macros and Mamas \/ postpartum script/);
    expect(spec).toMatch(/"tip":"/);
    expect(spec).toMatch(/not a program slogan/);
  });
});
