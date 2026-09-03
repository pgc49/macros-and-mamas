import { describe, expect, it } from "vitest";
import {
  RESEND_IDEMPOTENCY_MAX,
  readResendResult,
  resendIdempotencyKey,
} from "./resendSend.mjs";

describe("resendIdempotencyKey", () => {
  it("uses event-type/entity-id and stays under 256 chars", () => {
    const key = resendIdempotencyKey("quiz_opening_week_1h", "lead-123");
    expect(key).toBe("quiz_opening_week_1h/lead-123");
    expect(key.length).toBeLessThanOrEqual(RESEND_IDEMPOTENCY_MAX);
    expect(resendIdempotencyKey("quiz_opening_week_1h", "x".repeat(300)).length)
      .toBe(RESEND_IDEMPOTENCY_MAX);
    expect(resendIdempotencyKey("", "id")).toBe("");
  });
});

describe("readResendResult", () => {
  it("reads { data, error } and raw REST { id } success", () => {
    expect(readResendResult({ data: { id: "re_1" }, error: null }, 200)).toEqual({
      data: { id: "re_1" },
      error: null,
    });
    expect(readResendResult({ id: "re_2" }, 200)).toEqual({
      data: { id: "re_2" },
      error: null,
    });
  });

  it("treats SDK and HTTP errors as error, never as sent", () => {
    const sdk = readResendResult({
      data: null,
      error: { message: "rate limited", statusCode: 429, name: "rate_limit_exceeded" },
    }, 429);
    expect(sdk.data).toBeNull();
    expect(sdk.error.message).toMatch(/rate limited/);
    expect(sdk.error.statusCode).toBe(429);

    const http = readResendResult({ message: "Invalid to", statusCode: 422, name: "validation_error" }, 422);
    expect(http.data).toBeNull();
    expect(http.error.message).toMatch(/Invalid to/);
    expect(http.error.statusCode).toBe(422);
  });
});
