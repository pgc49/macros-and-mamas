import { describe, expect, it } from "vitest";
import {
  channelNotificationUrl,
  dmNotificationUrl,
  parseMessageDeepLink,
} from "./messageDeepLink";

describe("parseMessageDeepLink", () => {
  it("reads channel, client, and message from a query string", () => {
    expect(parseMessageDeepLink(
      "?tab=messages&channel=aug&message=m-9",
    )).toEqual({
      channel: "aug",
      client: null,
      message: "m-9",
    });
    expect(parseMessageDeepLink(
      new URLSearchParams("tab=messages&client=mama-1&message=m-2"),
    )).toEqual({
      channel: null,
      client: "mama-1",
      message: "m-2",
    });
  });

  it("treats blank params as missing", () => {
    expect(parseMessageDeepLink("")).toEqual({
      channel: null,
      client: null,
      message: null,
    });
  });
});

describe("notification URLs", () => {
  it("deep-links a mama DM to the Messages tab and the row", () => {
    expect(dmNotificationUrl({ messageId: "m-1" })).toBe(
      "/dashboard?tab=messages&message=m-1",
    );
  });

  it("deep-links Callie to that mama's thread and the row", () => {
    expect(dmNotificationUrl({
      isAdminRecipient: true,
      clientId: "mama-1",
      messageId: "m-1",
    })).toBe("/admin?tab=messages&client=mama-1&message=m-1");
  });

  it("deep-links a group post to the channel and the row", () => {
    expect(channelNotificationUrl("aug", false, "m-9")).toBe(
      "/dashboard?tab=messages&channel=aug&message=m-9",
    );
    expect(channelNotificationUrl("aug", true, "m-9")).toBe(
      "/admin?tab=messages&channel=aug&message=m-9",
    );
  });
});
