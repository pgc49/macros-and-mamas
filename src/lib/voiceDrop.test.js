import { describe, expect, it } from "vitest";
import { voiceDropAudienceName } from "./voiceDrop";

describe("voiceDropAudienceName", () => {
  it("names Founding and Cohort 2 as separate live drops", () => {
    expect(voiceDropAudienceName("active", "2026-07")).toBe("Founding · active");
    expect(voiceDropAudienceName("active", "2026-08")).toBe("Cohort 2 · active");
  });

  it("names the shared and preview audiences", () => {
    expect(voiceDropAudienceName("all_mamas")).toBe("All mamas");
    expect(voiceDropAudienceName("admins")).toBe("Admins only");
  });
});
