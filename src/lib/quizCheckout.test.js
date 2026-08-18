import { describe, expect, it } from "vitest";
import { emailsMatch, normalizeEmail, resolveQuizEmail } from "./quizCheckout";

describe("normalizeEmail", () => {
  it("restores a plus alias that a query string decoded as a space", () => {
    expect(normalizeEmail("pgchammas metaadspaidtest@gmail.com"))
      .toBe("pgchammas+metaadspaidtest@gmail.com");
  });

  it("keeps an already-encoded plus alias", () => {
    expect(normalizeEmail("pgchammas+metaadspaidtest@gmail.com"))
      .toBe("pgchammas+metaadspaidtest@gmail.com");
  });
});

describe("emailsMatch", () => {
  it("matches the quiz plus-alias to the signed-in email", () => {
    expect(emailsMatch(
      "pgchammas+metaadspaidtest@gmail.com",
      "pgchammas+metaadspaidtest@gmail.com",
    )).toBe(true);
    expect(emailsMatch(
      "pgchammas+metaadspaidtest@gmail.com",
      "pgchammas metaadspaidtest@gmail.com",
    )).toBe(true);
  });
});

describe("resolveQuizEmail", () => {
  it("reads %2B from the sign-in query string as a plus", () => {
    const params = new URLSearchParams(
      "from=quiz&auth=create&email=pgchammas%2Bmetaadspaidtest%40gmail.com",
    );
    expect(params.get("email")).toBe("pgchammas+metaadspaidtest@gmail.com");
    expect(resolveQuizEmail(params)).toBe("pgchammas+metaadspaidtest@gmail.com");
  });
});
