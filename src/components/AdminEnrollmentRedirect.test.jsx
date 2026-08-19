// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminEnrollmentRedirect } from "./AdminEnrollmentRedirect";

const hrefFor = vi.fn(() => null);

vi.mock("../lib/adminEnrollmentRedirect", () => ({
  adminEnrollmentRedirectHref: (...args) => hrefFor(...args),
}));

afterEach(() => {
  cleanup();
  hrefFor.mockReset();
  hrefFor.mockReturnValue(null);
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminEnrollmentRedirect>
        <Routes>
          <Route path="/join" element={<div>join page</div>} />
          <Route path="/signin" element={<div>signin page</div>} />
        </Routes>
      </AdminEnrollmentRedirect>
    </MemoryRouter>,
  );
}

describe("AdminEnrollmentRedirect", () => {
  it("blocks the join page and hard-navigates when the helper returns www", () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    hrefFor.mockReturnValue("https://www.macrosandmamas.com/join?from=quiz");

    renderAt("/join?from=quiz");

    expect(screen.queryByText("join page")).toBeNull();
    expect(screen.getByText(/opening checkout on the customer app/i)).toBeTruthy();
    expect(replace).toHaveBeenCalledWith("https://www.macrosandmamas.com/join?from=quiz");
    vi.unstubAllGlobals();
  });

  it("renders children on www /join so customer checkout is unchanged", () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    hrefFor.mockReturnValue(null);

    renderAt("/join?from=quiz");

    expect(screen.getByText("join page")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
