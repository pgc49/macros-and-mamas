// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getSession = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabase: { auth: { getSession: (...args) => getSession(...args) } },
}));

const copyText = vi.fn();
vi.mock("../utils/clipboard", () => ({
  copyText: (...args) => copyText(...args),
}));

import { ReferralMonthCard } from "./ReferralMonthCard";

afterEach(() => {
  cleanup();
  getSession.mockReset();
  copyText.mockReset();
  vi.unstubAllGlobals();
});

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <ReferralMonthCard {...props} />
    </MemoryRouter>,
  );
}

describe("ReferralMonthCard copy", () => {
  it("shows the code in selectable type and copies it", async () => {
    copyText.mockResolvedValue(undefined);
    renderCard({ previewCode: "PAT25" });
    const code = screen.getByLabelText("Your referral code");
    expect(code.value).toBe("PAT25");
    expect(code.readOnly).toBe(true);
    expect(code.style.userSelect).toBe("all");
    expect(getSession).not.toHaveBeenCalled();
    const select = vi.spyOn(code, "select");
    fireEvent.click(code);
    expect(select).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(copyText).toHaveBeenCalledWith("PAT25");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Share my code" }).getAttribute("href")).toBe("/account/share");
  });

  it("loads the signed-in code from /api/referrals", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: "AMANDA7" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderCard();
    expect((await screen.findByLabelText("Your referral code")).value).toBe("AMANDA7");
    expect(fetchMock).toHaveBeenCalledWith("/api/referrals", {
      headers: { authorization: "Bearer token" },
    });
  });

  it("keeps Share my code when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderCard();
    expect(screen.getByRole("link", { name: "Share my code" }).getAttribute("href")).toBe("/account/share");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
  });

  it("tells her to select the code when the clipboard rejects", async () => {
    copyText.mockRejectedValue(new Error("denied"));
    renderCard({ previewCode: "PAT25" });
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(await screen.findByText(/Select the code and copy it/)).toBeTruthy();
    expect(screen.getByLabelText("Your referral code").style.userSelect).toBe("all");
  });

  it("clears the copied confirmation timer on unmount", async () => {
    copyText.mockResolvedValue(undefined);
    const view = renderCard({ previewCode: "PAT25" });
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    const clear = vi.spyOn(window, "clearTimeout");
    view.unmount();
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
