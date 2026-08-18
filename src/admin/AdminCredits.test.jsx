// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActiveReferralsList, OutstandingCreditsList } from "./AdminCredits.jsx";

afterEach(() => {
  cleanup();
});

describe("OutstandingCreditsList", () => {
  it("shows who has ready vs waiting credit", () => {
    render(
      <OutstandingCreditsList
        rows={[
          {
            userId: "adv-1",
            name: "Megan Onnelly",
            email: "megan@example.com",
            availableCents: 2500,
            pendingCents: 2500,
            code: "MEGANO25",
          },
        ]}
      />,
    );
    expect(screen.getByText("Megan Onnelly")).toBeTruthy();
    expect(screen.getByText(/\$25.00 ready/)).toBeTruthy();
    expect(screen.getByText(/\$25.00 waiting/)).toBeTruthy();
    expect(screen.getByText(/MEGANO25/)).toBeTruthy();
  });

  it("says when nobody has a balance", () => {
    render(<OutstandingCreditsList rows={[]} />);
    expect(screen.getByText("Nobody has a credit waiting right now.")).toBeTruthy();
  });
});

describe("ActiveReferralsList", () => {
  it("shows advocate → friend and can message the advocate", () => {
    let messaged = "";
    render(
      <ActiveReferralsList
        rows={[
          {
            id: "ref-1",
            code: "MEGANO25",
            status: "paid",
            advocateUserId: "adv-1",
            advocateName: "Megan Onnelly",
            referredUserId: "friend-1",
            referredName: "Jennifer A Stone",
          },
        ]}
        onMessageAdvocate={(id) => { messaged = id; }}
      />,
    );
    expect(screen.getByText("Megan Onnelly")).toBeTruthy();
    expect(screen.getByText(/Jennifer A Stone/)).toBeTruthy();
    expect(screen.getByText(/MEGANO25/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Message Megan Onnelly"));
    expect(messaged).toBe("adv-1");
  });

  it("says when no codes have been used", () => {
    render(<ActiveReferralsList rows={[]} />);
    expect(screen.getByText("No friend has used a share code yet.")).toBeTruthy();
  });
});
