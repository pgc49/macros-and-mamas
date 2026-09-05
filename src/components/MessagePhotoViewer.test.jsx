// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessagePhotoViewer } from "./MessagePhotoViewer";

afterEach(() => {
  cleanup();
});

describe("MessagePhotoViewer", () => {
  it("does not render when there is no photo", () => {
    const { container } = render(<MessagePhotoViewer src="" onClose={() => {}} />);
    expect(container.querySelector("[data-photo-viewer]")).toBeNull();
  });

  it("closes from the X, the dimmed edge, or Escape", () => {
    const onClose = vi.fn();
    render(<MessagePhotoViewer src="https://example.com/pic.jpg" alt="Plate" onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Photo" })).toBeTruthy();
    expect(screen.getByAltText("Plate").getAttribute("src")).toBe("https://example.com/pic.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Close photo" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("dialog", { name: "Photo" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
