import { describe, expect, it } from "vitest";
import { isAdminQaClient, isAdminQaEmail } from "./adminQa.js";

describe("isAdminQaEmail", () => {
  it("matches Gmail plus-addresses on the pgchammas local-part, case-insensitive", () => {
    expect(isAdminQaEmail("pgchammas+qa-quiz@gmail.com")).toBe(true);
    expect(isAdminQaEmail("pgchammas+hold322a@gmail.com")).toBe(true);
    expect(isAdminQaEmail("PGChammas+QA-Quiz@Gmail.COM")).toBe(true);
    expect(isAdminQaEmail("  pgchammas+demo@gmail.com  ")).toBe(true);
  });

  it("does not hide the owner address or real mamas", () => {
    expect(isAdminQaEmail("pgchammas@gmail.com")).toBe(false);
    expect(isAdminQaEmail("PGChammas@gmail.com")).toBe(false);
    expect(isAdminQaEmail("dollychammas@gmail.com")).toBe(false);
    expect(isAdminQaEmail("rachel@example.com")).toBe(false);
    expect(isAdminQaEmail("summer@example.com")).toBe(false);
    expect(isAdminQaEmail("notpgchammas+foo@gmail.com")).toBe(false);
    expect(isAdminQaEmail("")).toBe(false);
    expect(isAdminQaEmail(null)).toBe(false);
  });
});

describe("isAdminQaClient", () => {
  it("reads profile or auth email", () => {
    expect(isAdminQaClient({ email: "pgchammas+qa-quiz@gmail.com" })).toBe(true);
    expect(isAdminQaClient({ email: "mama@example.com", auth_email: "pgchammas+hold322a@gmail.com" })).toBe(true);
    expect(isAdminQaClient({ emailLower: "pgchammas+demo@gmail.com" })).toBe(true);
    expect(isAdminQaClient({ email: "pgchammas@gmail.com" })).toBe(false);
    expect(isAdminQaClient({ email: "dolly@example.com" })).toBe(false);
    expect(isAdminQaClient(null)).toBe(false);
  });
});
