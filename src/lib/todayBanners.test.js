import { describe, expect, it } from "vitest";
import { bannerCanGreetNewUser, TODAY_BANNERS, todayBannerIds } from "./todayBanners";

describe("todayBanners catalog", () => {
  it("lists Today cards in the order they stack on the page", () => {
    expect(todayBannerIds()).toEqual([
      "updateReady",
      "whatsNew",
      "voiceDrop",
      "homescreen",
      "notifications",
    ]);
  });

  it("marks the automated first-week cards a new mama can see", () => {
    expect(bannerCanGreetNewUser("homescreen")).toBe(true);
    expect(bannerCanGreetNewUser("notifications")).toBe(true);
    expect(bannerCanGreetNewUser("whatsNew")).toBe(true);
    expect(bannerCanGreetNewUser("voiceDrop")).toBe(true);
    expect(bannerCanGreetNewUser("updateReady")).toBe(false);
  });

  it("keeps pin-to-home-screen automatic for every cohort", () => {
    const pin = TODAY_BANNERS.find((b) => b.id === "homescreen");
    expect(pin.automated).toBe(true);
    expect(pin.trigger).toMatch(/automatic/i);
    expect(pin.callieControls).toMatch(/none/i);
  });
});
