// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
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

  it("locks page scroll so Messages can pin the composer", () => {
    const view = render(
      <MemoryRouter>
        <Shell bottomBar={<nav>tabs</nav>} lockContentScroll>body</Shell>
      </MemoryRouter>,
    );
    const content = view.container.querySelector("[data-shell-content]");
    const fill = view.container.querySelector("[data-shell-fill]");
    expect(content.getAttribute("data-lock-scroll")).toBe("true");
    expect(content.style.overflowY).toBe("auto");
    expect(content.style.display).toBe("flex");
    expect(fill).toBeTruthy();
    expect(fill.style.flexGrow).toBe("1");
    expect(fill.style.minHeight).toBe("0px");
    expect(fill.style.overflow).toBe("hidden");
  });

  it("keeps tab children mounted when Messages locks the pane", () => {
    let mounts = 0;
    function Probe() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <div>probe</div>;
    }
    const view = render(
      <MemoryRouter>
        <Shell bottomBar={<nav>tabs</nav>}>
          <Probe />
        </Shell>
      </MemoryRouter>,
    );
    expect(mounts).toBe(1);
    view.rerender(
      <MemoryRouter>
        <Shell bottomBar={<nav>tabs</nav>} lockContentScroll>
          <Probe />
        </Shell>
      </MemoryRouter>,
    );
    expect(mounts).toBe(1);
    expect(view.container.querySelector("[data-shell-main]")).toBeTruthy();
    expect(view.container.querySelector("[data-shell-fill]")).toBeTruthy();
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
