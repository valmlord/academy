// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createTicketVerifier,
  deriveTicketKey,
  lazyTicketKey,
  mintTicket,
  TicketKeyError,
} from "./ticket.ts";

// U-ticket (#32 design 3.3 item 2, 10.3). Every case goes through the real verify, latin1 compare included.
// Each forged-MAC case mints its own fresh token, so the used-nonce set can never be what refuses it.

const KEY = deriveTicketKey("canary-ticket-secret".padEnd(40, "x"));
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const CLAIMS = { u: "user_a", c: "agentic-dev", l: "first-lesson", dl: NOW + 900_000 };
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function fresh(): string {
  return mintTicket(KEY, CLAIMS, NOW);
}

function partsOf(token: string): { encoded: string; mac: string } {
  const [encoded = "", mac = ""] = token.split(".");
  return { encoded, mac };
}

function decoded(token: string): Record<string, unknown> {
  const value: unknown = JSON.parse(Buffer.from(partsOf(token).encoded, "base64url").toString());
  if (typeof value !== "object" || value === null) throw new Error("payload is not an object");
  return { ...value };
}

/** A token for any payload, signed with the real key: what a holder of the key could make. */
function signed(payload: Record<string, unknown>, key: Buffer = KEY): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", key).update(encoded).digest("base64url")}`;
}

function payload(change: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    ...CLAIMS,
    exp: NOW + 30_000,
    n: "0123456789abcdef0123456789abcdef",
    ...change,
  };
}

function verifyOnce(token: string, now = NOW + 1_000): boolean {
  return createTicketVerifier().verify(token, KEY, now).ok;
}

describe("ticket mint and verify (U-ticket)", () => {
  it("accepts a fresh ticket once and returns its payload", () => {
    const token = fresh();

    const verdict = createTicketVerifier().verify(token, KEY, NOW + 1_000);

    expect(verdict).toEqual({ ok: true, payload: decoded(token) });
    expect(decoded(token)).toMatchObject({ v: 1, ...CLAIMS, exp: NOW + 30_000 });
    expect(decoded(token).n).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses a replay of an accepted ticket", () => {
    const verifier = createTicketVerifier();
    const token = fresh();

    expect(verifier.verify(token, KEY, NOW + 1_000).ok).toBe(true);
    expect(verifier.verify(token, KEY, NOW + 2_000).ok).toBe(false);
  });

  it("refuses a payload re-encoded with another user and the old MAC", () => {
    const token = fresh();
    const forged = Buffer.from(JSON.stringify({ ...decoded(token), u: "user_b" })).toString(
      "base64url",
    );

    expect(verifyOnce(`${forged}.${partsOf(token).mac}`)).toBe(false);
  });

  it("refuses every single-character change of a valid token to another base64url character", () => {
    const token = fresh();
    const accepted: string[] = [];
    for (let position = 0; position < token.length; position += 1) {
      if (token[position] === ".") continue;
      for (const replacement of BASE64URL) {
        if (replacement === token[position]) continue;
        const changed = `${token.slice(0, position)}${replacement}${token.slice(position + 1)}`;
        if (verifyOnce(changed)) accepted.push(changed);
      }
    }

    expect(accepted).toEqual([]);
    // Positive control: the unchanged token passes the same verify.
    expect(verifyOnce(token)).toBe(true);
  });

  it("refuses a MAC of 42 base64url characters without throwing", () => {
    const { encoded, mac } = partsOf(fresh());

    expect(verifyOnce(`${encoded}.${mac.slice(0, 42)}`)).toBe(false);
  });

  it("refuses a MAC of 44 base64url characters without throwing", () => {
    const { encoded, mac } = partsOf(fresh());

    expect(verifyOnce(`${encoded}.${mac}A`)).toBe(false);
  });

  it("refuses a MAC with a character replaced by its U+0100-shifted twin (A becomes Ł)", () => {
    const { encoded, mac } = partsOf(fresh());
    const shifted = String.fromCharCode(mac.charCodeAt(0) + 0x100);

    expect(verifyOnce(`${encoded}.${shifted}${mac.slice(1)}`)).toBe(false);
  });

  it("refuses a MAC of 42 characters plus é (43 UTF-16 units) without throwing", () => {
    const { encoded, mac } = partsOf(fresh());

    expect(verifyOnce(`${encoded}.${mac.slice(0, 42)}é`)).toBe(false);
  });

  it("refuses a 3000-character token", () => {
    const { mac } = partsOf(fresh());

    expect(verifyOnce(`${"A".repeat(3000 - 44)}.${mac}`)).toBe(false);
  });

  it("refuses a ticket signed with another key", () => {
    const other = deriveTicketKey("another-ticket-secret".padEnd(40, "y"));

    expect(verifyOnce(mintTicket(other, CLAIMS, NOW))).toBe(false);
  });

  it("refuses an expired ticket", () => {
    expect(verifyOnce(fresh(), NOW + 30_000)).toBe(false);
  });

  it.each([
    ["an expiry more than 35 s ahead", { exp: NOW + 36_001 }],
    ["a version other than 1", { v: 2 }],
    ["an extra key", { extra: true }],
    ["a user id with a slash", { u: "user/a" }],
    ["a course id with ..", { c: ".." }],
    ["a lesson id with an upper-case letter", { l: "First" }],
    ["a nonce that is not 32 lowercase hex", { n: "0123456789ABCDEF0123456789ABCDEF" }],
    ["a deadline in the past", { dl: NOW }],
    ["a deadline more than 3600 s ahead", { dl: NOW + 1_000 + 3_600_001 }],
    ["a fractional deadline", { dl: NOW + 60_000.5 }],
  ])("refuses a correctly signed payload with %s", (_case, change) => {
    expect(verifyOnce(signed(payload(change)))).toBe(false);
  });

  it("accepts a correctly signed payload at the edges of its time windows", () => {
    expect(verifyOnce(signed(payload({ exp: NOW + 36_000, dl: NOW + 3_601_000 })))).toBe(true);
  });

  it("refuses a payload that is not JSON or not an object", () => {
    const notJson = Buffer.from("not json").toString("base64url");
    const array = Buffer.from("[1,2]").toString("base64url");

    for (const encoded of [notJson, array]) {
      const mac = createHmac("sha256", KEY).update(encoded).digest("base64url");
      expect(verifyOnce(`${encoded}.${mac}`)).toBe(false);
    }
  });
});

describe("ticket key", () => {
  it.each([undefined, ""])("refuses to derive a key from %j", (secret) => {
    expect(() => deriveTicketKey(secret)).toThrow(TicketKeyError);
  });

  it("derives the key once and keeps it", () => {
    let reads = 0;
    const key = lazyTicketKey(() => {
      reads += 1;
      return "canary-ticket-secret".padEnd(40, "x");
    });

    expect(key().equals(KEY)).toBe(true);
    expect(key()).toBe(key());
    expect(reads).toBe(1);
  });
});
