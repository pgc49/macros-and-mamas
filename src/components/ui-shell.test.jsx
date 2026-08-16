// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../auth/useAuth.jsx", () => ({
  useAuth: () => ({
    user: { email: "admin@example.com" },
    profile: { name: "Admin" },
    isAdmin: true,
  }),
}));

import { Shell } from "./ui";

afterEach(() => {
  cleanup();
});

describe("Shell content width", () => {
  it("defaults to the phone-width column", () => {
    const view = render(
      <MemoryRouter>
        <Shell>body</Shell>
      </MemoryRouter>,
    );
    const content = view.container.querySelector("[data-shell-content]");
    expect(content.style.maxWidth).toBe("560px");
  });

  it("widens when admin Messages needs a split inbox", () => {
    const view = render(
      <MemoryRouter>
        <Shell contentMaxWidth={1120}>body</Shell>
      </MemoryRouter>,
    );
    const content = view.container.querySelector("[data-shell-content]");
    expect(content.style.maxWidth).toBe("1120px");
  });

  it("keeps the Admin link same-origin on combined/admin surfaces", () => {
    const view = render(
      <MemoryRouter>
        <Shell>body</Shell>
      </MemoryRouter>,
    );
    const admin = view.getByText("Admin");
    expect(admin.getAttribute("href")).toBe("/admin");
  });
});
