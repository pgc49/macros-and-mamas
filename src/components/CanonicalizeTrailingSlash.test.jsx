// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { CanonicalizeTrailingSlash } from "./CanonicalizeTrailingSlash";

function PathProbe() {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}`}</div>;
}

describe("CanonicalizeTrailingSlash", () => {
  it("rewrites /signin/ to /signin and keeps the quiz query", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/signin/?from=quiz&auth=create"]}>
        <CanonicalizeTrailingSlash />
        <Routes>
          <Route path="/signin" element={<PathProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.textContent).toBe("/signin?from=quiz&auth=create");
  });
});
