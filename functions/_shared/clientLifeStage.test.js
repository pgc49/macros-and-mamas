import { describe, expect, it } from "vitest";
import {
  buildClientLifeStageBlock,
  groundClientFacingComment,
  hasPostpartumSeason,
  lifeStageCommentRules,
  monthsPpNumber,
} from "./clientLifeStage.js";

const dolly = {
  name: "Dolly",
  breastfeeding: false,
  monthsPP: "",
  pregnant: false,
  goal: "lose",
};

const nursingMama = {
  name: "Sarah",
  breastfeeding: true,
  monthsPP: 9,
  pregnant: false,
  goal: "lose",
};

describe("hasPostpartumSeason", () => {
  it("is false when months and nursing are unset — Dolly's case", () => {
    expect(hasPostpartumSeason(dolly)).toBe(false);
    expect(hasPostpartumSeason({ breastfeeding: false, months_pp: null })).toBe(false);
    expect(hasPostpartumSeason({})).toBe(false);
    expect(hasPostpartumSeason(null)).toBe(false);
  });

  it("is true when she is nursing or has months postpartum on file", () => {
    expect(hasPostpartumSeason(nursingMama)).toBe(true);
    expect(hasPostpartumSeason({ breastfeeding: false, monthsPP: 14 })).toBe(true);
    expect(hasPostpartumSeason({ months_pp: "6" })).toBe(true);
  });
});

describe("monthsPpNumber", () => {
  it("reads monthsPP or months_pp and ignores blanks", () => {
    expect(monthsPpNumber({ monthsPP: 9 })).toBe(9);
    expect(monthsPpNumber({ months_pp: "4" })).toBe(4);
    expect(monthsPpNumber({ monthsPP: "" })).toBe(null);
    expect(monthsPpNumber({ months_pp: null })).toBe(null);
  });
});

describe("buildClientLifeStageBlock", () => {
  it("tells the model Dolly is not postpartum and not to assume it", () => {
    const block = buildClientLifeStageBlock(dolly);
    expect(block).toMatch(/Name: Dolly/);
    expect(block).toMatch(/Postpartum: not listed/);
    expect(block).toMatch(/do NOT assume she is postpartum/);
    expect(block).toMatch(/Breastfeeding: no/);
    expect(block).toMatch(/Goal: lose fat/);
    expect(block).toMatch(lifeStageCommentRules(dolly));
    expect(block).not.toMatch(/Postpartum: yes/);
  });

  it("lists months and nursing when the profile has them", () => {
    const block = buildClientLifeStageBlock(nursingMama);
    expect(block).toMatch(/Postpartum: yes \(9 months\)/);
    expect(block).toMatch(/Breastfeeding: yes/);
    expect(block).not.toMatch(/do NOT assume she is postpartum/);
  });
});

describe("groundClientFacingComment", () => {
  it("strips a generic postpartum compliment when she is not postpartum", () => {
    expect(groundClientFacingComment("This is an excellent postpartum meal.", dolly))
      .toBe("This is an excellent meal.");
    expect(groundClientFacingComment("Great post-partum recovery plate — solid protein.", dolly))
      .toBe("Great plate — solid protein.");
    expect(groundClientFacingComment("Nice new-mom dinner.", dolly)).toBe("Nice dinner.");
  });

  it("strips milk-supply talk when she is not nursing", () => {
    expect(groundClientFacingComment("Protein like this supports milk supply.", dolly))
      .toBe("Protein like this.");
    expect(groundClientFacingComment("Nice protein-forward plate.", dolly))
      .toBe("Nice protein-forward plate.");
  });

  it("keeps postpartum wording when her profile lists that season", () => {
    expect(groundClientFacingComment("Solid postpartum protein plate.", nursingMama))
      .toBe("Solid postpartum protein plate.");
    expect(groundClientFacingComment("Good protein while breastfeeding.", nursingMama))
      .toBe("Good protein while breastfeeding.");
  });

  it("strips postpartum talk when profile is missing — safer default", () => {
    expect(groundClientFacingComment("Excellent postpartum meal.", null))
      .toBe("Excellent meal.");
  });
});
