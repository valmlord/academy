// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createTicketVerifier, deriveTicketKey } from "@/server/ticket";

// The marker throws outside Next's server layers; the module under test is everything after it.
vi.mock("server-only", () => ({}));

const { mintTerminalTicket, RENEW_MARGIN_MS } = await import("./mint");

// U-ticket, mint part (#32 design 3.3 item 2): the deadline never outlives the session or the cap, and the
// renewal delay is null when it would be below 30 s.

const KEY = deriveTicketKey("canary-mint-secret".padEnd(40, "x"));
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const REQUEST = { userId: "user_a", courseId: "agentic-dev", lessonId: "first-lesson" };

function deadlineOf(ticket: string): number {
  const verdict = createTicketVerifier().verify(ticket, KEY, NOW + 1);
  if (!verdict.ok) throw new Error("the minted ticket does not verify");
  return verdict.payload.dl;
}

describe("mintTerminalTicket", () => {
  it("cuts at mint + cap when the session lives longer, and renews a minute before", () => {
    const minted = mintTerminalTicket(
      KEY,
      { ...REQUEST, sessionExpiresAt: NOW + 7 * 24 * 3_600_000 },
      900,
      NOW,
    );

    expect(deadlineOf(minted.ticket)).toBe(NOW + 900_000);
    expect(minted.renewInMs).toBe(900_000 - RENEW_MARGIN_MS);
  });

  it("cuts at the session's expiry when it comes before the cap", () => {
    const minted = mintTerminalTicket(
      KEY,
      { ...REQUEST, sessionExpiresAt: NOW + 300_000 },
      900,
      NOW,
    );

    expect(deadlineOf(minted.ticket)).toBe(NOW + 300_000);
    expect(minted.renewInMs).toBe(240_000);
  });

  it("renews at exactly 30 s, the minimum", () => {
    const minted = mintTerminalTicket(
      KEY,
      { ...REQUEST, sessionExpiresAt: NOW + 90_000 },
      900,
      NOW,
    );

    expect(minted.renewInMs).toBe(30_000);
  });

  it("does not renew when the deadline is within 90 s", () => {
    const minted = mintTerminalTicket(
      KEY,
      { ...REQUEST, sessionExpiresAt: NOW + 89_999 },
      900,
      NOW,
    );

    expect(deadlineOf(minted.ticket)).toBe(NOW + 89_999);
    expect(minted.renewInMs).toBeNull();
  });
});
