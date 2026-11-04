import "server-only";
import { lazyTicketKey, mintTicket } from "../../server/ticket.ts";
import { RELAY_MAX_SECONDS, readIntegerSetting } from "../workspace/env";

// The openTerminal side of the ticket (#32 design 3.3 item 2): the deadline and the renewal delay the browser
// gets (3.6.1). renewInMs is relative, so a clock difference between web and the browser does not matter.

// The browser renews this long before the deadline; below RENEW_MIN_MS it does not renew at all and lets the
// relay cut, because a renewal loop at a natural session expiry would only repeat until the expiry.
export const RENEW_MARGIN_MS = 60_000;
export const RENEW_MIN_MS = 30_000;

export interface TicketRequest {
  userId: string;
  courseId: string;
  lessonId: string;
  /** The session's expiry, epoch ms, already checked to be finite and in the future. */
  sessionExpiresAt: number;
}

export interface TerminalTicket {
  ticket: string;
  renewInMs: number | null;
}

export function mintTerminalTicket(
  key: Buffer,
  request: TicketRequest,
  capSeconds: number,
  now: number,
): TerminalTicket {
  const dl = Math.min(request.sessionExpiresAt, now + capSeconds * 1000);
  const ticket = mintTicket(
    key,
    { u: request.userId, c: request.courseId, l: request.lessonId, dl },
    now,
  );
  const untilRenewal = dl - now - RENEW_MARGIN_MS;
  return { ticket, renewInMs: untilRenewal >= RENEW_MIN_MS ? untilRenewal : null };
}

const ticketKey = lazyTicketKey(() => process.env.BETTER_AUTH_SECRET);

/** Throws `TicketKeyError` when the key cannot be derived; the startup check makes that unreachable. */
export function mintForSession(request: TicketRequest): TerminalTicket {
  const capSeconds = readIntegerSetting(
    { TERMINAL_RELAY_MAX_SECONDS: process.env.TERMINAL_RELAY_MAX_SECONDS },
    RELAY_MAX_SECONDS,
  );
  return mintTerminalTicket(ticketKey(), request, capSeconds, Date.now());
}
