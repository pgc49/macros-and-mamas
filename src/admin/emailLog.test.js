import { describe, expect, it } from "vitest";
import { emailRecipient, emailTypeLabel } from "./emailLog.js";

describe("emailRecipient", () => {
  it("shows first name and email for a mama send", () => {
    const who = emailRecipient({
      to_email: "dollychammas@gmail.com",
      profiles: { name: "Dolly", last_name: "Chammas", email: "dollychammas@gmail.com" },
    });
    expect(who).toEqual({
      name: "Dolly Chammas",
      email: "dollychammas@gmail.com",
      coach: false,
    });
  });

  it("falls back to the address when the profile is missing", () => {
    const who = emailRecipient({
      to_email: "pgchammas+tteeesst@gmail.com",
      email_type: "finish_joining_1h",
    });
    expect(who.email).toBe("pgchammas+tteeesst@gmail.com");
    expect(who.name).toBe("pgchammas+tteeesst");
  });

  it("labels Callie notifies as Callie", () => {
    const who = emailRecipient({ to_email: "callie", email_type: "callie_intake" });
    expect(who.name).toBe("Callie");
    expect(who.coach).toBe(true);
  });
});

describe("emailTypeLabel", () => {
  it("distinguishes a message email from a blank type", () => {
    expect(emailTypeLabel({ email_type: "message", meta: { route: "admin_to_mama" } }))
      .toBe("Message to mama");
    expect(emailTypeLabel({ email_type: "welcome" })).toBe("Welcome");
    expect(emailTypeLabel({ email_type: "quiz_drip_2d" })).toBe("Quiz drip (+2d)");
    expect(emailTypeLabel({ email_type: "quiz_pregnancy_note" })).toBe("Quiz pregnancy note (+3d)");
  });
});
