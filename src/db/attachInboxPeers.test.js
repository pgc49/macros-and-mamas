import { describe, expect, it } from "vitest";
import { attachInboxPeers } from "./db.js";

describe("attachInboxPeers", () => {
  it("copies first, last, and email onto inbox rows for title fallback", () => {
    const rows = attachInboxPeers(
      [
        { clientId: "c1", participantIds: ["c1", "admin"], lastMessage: { body: "hi" } },
        { clientId: "c2", participantIds: ["c2"], lastMessage: { body: "hey" } },
      ],
      [
        { id: "c1", name: "Christina", last_name: "Lee", email: "christina@example.com", role: "client" },
        { id: "c2", name: "Mama", last_name: "Wells", email: "wells@example.com", role: "client" },
        { id: "admin", name: "Callie", last_name: "", email: "callie@example.com", role: "admin" },
      ],
    );

    expect(rows[0].peer).toMatchObject({
      id: "c1",
      name: "Christina",
      lastName: "Lee",
      email: "christina@example.com",
    });
    expect(rows[0].participantPeers.map((p) => p.id)).toEqual(["c1", "admin"]);
    expect(rows[1].peer.lastName).toBe("Wells");
    expect(rows[1].peer.name).toBe("Mama");
  });
});
