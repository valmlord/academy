import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// Terminal tickets (#32 design 3.3 item 2, ADR-0011 item 3): minted by the openTerminal server action inside the
// Next bundle, verified by the relay in the custom server. Only node:crypto, so both sides import this file.
// Token: base64url(JSON payload) "." base64url(HMAC-SHA256(key, first part)).

export interface TicketPayload {
  v: 1;
  /** The session's user id. */
  u: string;
  c: string;
  l: string;
  /** Expiry, epoch ms: mint + 30 s. */
  exp: number;
  /** Connection deadline, epoch ms: min(session expiry, mint + TERMINAL_RELAY_MAX_SECONDS). */
  dl: number;
  /** 128-bit single-use nonce, lowercase hex. */
  n: string;
}

export const TICKET_LIFETIME_MS = 30_000;
// 5 s on top of the lifetime for clock steps between mint and verify; both run in the same web process.
const EXPIRY_LIMIT_MS = TICKET_LIFETIME_MS + 5_000;
// TERMINAL_RELAY_MAX_SECONDS is at most 3600.
const DEADLINE_LIMIT_MS = 3_600_000;
const KEY_INFO = "academy terminal ticket v1";
const KEY_LENGTH = 32;

// (a) of the verify order. A 32-byte MAC is exactly 43 base64url characters. Checked before any split, decode
// or compare: latin1 writes one byte per UTF-16 unit, so without it a 42- or 44-character MAC makes
// timingSafeEqual throw RangeError, and a character above U+00FF would be truncated to its low byte and could
// compare equal.
const TOKEN = /^[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{43}$/;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
// A safe charset only; the service applies the exact lesson-schema slug rule.
const SLUG = /^[a-z0-9][a-z0-9-]{0,127}$/;
const NONCE = /^[0-9a-f]{32}$/;
const PAYLOAD_KEYS = ["c", "dl", "exp", "l", "n", "u", "v"];

export class TicketKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketKeyError";
  }
}

/** HKDF-SHA256 of `BETTER_AUTH_SECRET` (empty salt); throws `TicketKeyError` when it cannot be derived. */
export function deriveTicketKey(secret: string | undefined): Buffer {
  if (secret === undefined || secret === "") {
    throw new TicketKeyError("BETTER_AUTH_SECRET is not set");
  }
  try {
    return Buffer.from(hkdfSync("sha256", secret, "", KEY_INFO, KEY_LENGTH));
  } catch {
    throw new TicketKeyError("the ticket key could not be derived");
  }
}

/** The key, derived on first use and kept; a failed derivation is retried on the next call. */
export function lazyTicketKey(readSecret: () => string | undefined): () => Buffer {
  let key: Buffer | undefined;
  return () => {
    key ??= deriveTicketKey(readSecret());
    return key;
  };
}

function macOf(key: Buffer, encodedPayload: string): string {
  return createHmac("sha256", key).update(encodedPayload).digest("base64url");
}

export interface TicketClaims {
  u: string;
  c: string;
  l: string;
  dl: number;
}

export function mintTicket(key: Buffer, claims: TicketClaims, now: number): string {
  const payload: TicketPayload = {
    v: 1,
    u: claims.u,
    c: claims.c,
    l: claims.l,
    exp: now + TICKET_LIFETIME_MS,
    dl: claims.dl,
    n: randomBytes(16).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${macOf(key, encoded)}`;
}

function isTimeWithin(value: unknown, now: number, limitMs: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    now < value &&
    value <= now + limitMs
  );
}

// (d) of the verify order: exactly the seven keys, each by its rule.
function toPayload(value: unknown, now: number): TicketPayload | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const keys = Object.keys(value).sort();
  if (keys.length !== PAYLOAD_KEYS.length || keys.some((key, i) => key !== PAYLOAD_KEYS[i])) {
    return undefined;
  }
  const field = (name: string): unknown => Reflect.get(value, name);
  const [v, u, c, l, exp, dl, n] = ["v", "u", "c", "l", "exp", "dl", "n"].map(field);
  if (v !== 1) return undefined;
  if (typeof u !== "string" || !USER_ID.test(u)) return undefined;
  if (typeof c !== "string" || !SLUG.test(c)) return undefined;
  if (typeof l !== "string" || !SLUG.test(l)) return undefined;
  if (typeof n !== "string" || !NONCE.test(n)) return undefined;
  if (!isTimeWithin(exp, now, EXPIRY_LIMIT_MS)) return undefined;
  if (!isTimeWithin(dl, now, DEADLINE_LIMIT_MS)) return undefined;
  return { v, u, c, l, exp, dl, n };
}

export type TicketVerdict = { ok: true; payload: TicketPayload } | { ok: false };

export interface TicketVerifier {
  /** Every refusal is `{ ok: false }`; never throws. A ticket is accepted once per verifier. */
  verify(token: string, key: Buffer, now: number): TicketVerdict;
}

/** A verifier with its own used-nonce set (per process in the relay: residual R-replay). */
export function createTicketVerifier(): TicketVerifier {
  const used = new Map<string, number>();
  const refused: TicketVerdict = { ok: false };
  return {
    verify(token, key, now) {
      // An expired nonce can be forgotten: its ticket fails the expiry check anyway.
      for (const [nonce, exp] of used) if (exp <= now) used.delete(nonce);
      if (!TOKEN.test(token)) return refused;
      const [encoded = "", mac = ""] = token.split(".");
      if (
        !timingSafeEqual(Buffer.from(mac, "latin1"), Buffer.from(macOf(key, encoded), "latin1"))
      ) {
        return refused;
      }
      let value: unknown;
      try {
        value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      } catch {
        return refused;
      }
      const payload = toPayload(value, now);
      if (payload === undefined || used.has(payload.n)) return refused;
      used.set(payload.n, payload.exp);
      return { ok: true, payload };
    },
  };
}
