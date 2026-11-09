import { z } from "zod";

// The terminal WebSocket protocol (ADR-0011 item 6, design 3.2.1): JSON text frames from the browser, JSON
// text frames plus binary output from the service, and the close codes with their fixed reasons (F6).

/** UTF-16 units per `input` message; the browser chunks a paste to this size (design 3.2 "Limits"). */
export const MAX_INPUT_UNITS = 8192;
/** The largest single acknowledgement: 16 MiB of processed output. */
export const MAX_ACK_BYTES = 16 * 1024 * 1024;
export const COLS_RANGE = { min: 2, max: 500 };
export const ROWS_RANGE = { min: 1, max: 200 };

const inputMessage = z.strictObject({
  t: z.literal("input"),
  d: z.string().min(1).max(MAX_INPUT_UNITS),
});
const resizeMessage = z.strictObject({
  t: z.literal("resize"),
  cols: z.number().int().min(COLS_RANGE.min).max(COLS_RANGE.max),
  rows: z.number().int().min(ROWS_RANGE.min).max(ROWS_RANGE.max),
});
const ackMessage = z.strictObject({
  t: z.literal("ack"),
  n: z.number().int().min(1).max(MAX_ACK_BYTES),
});
const clientMessage = z.discriminatedUnion("t", [inputMessage, resizeMessage, ackMessage]);

export type ClientMessage = z.infer<typeof clientMessage>;

/** A text frame from the browser, or `null` for anything the protocol does not define (row 17: 1008). */
export function parseClientMessage(text: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const result = clientMessage.safeParse(value);
  return result.success ? result.data : null;
}

/** The first frame on every attach; `resumed` is false only for the connection that created the session. */
export function attachedFrame(resumed: boolean): string {
  return JSON.stringify({ t: "attached", resumed });
}

/** The serialized screen a resumed attach gets before any live output. */
export function snapshotFrame(screen: string): string {
  return JSON.stringify({ t: "snapshot", d: screen });
}

/** Close codes of ADR-0011 item 6; 1003 and 1009 carry no reason. */
export const CLOSE = {
  exited: 4000,
  takenOver: 4001,
  environmentStopped: 4002,
  shuttingDown: 1001,
  unsupportedData: 1003,
  policy: 1008,
  internal: 1011,
} as const;

/** The close codes a session ends with (`Session.end`); each has one fixed reason except 4000. */
export type EndCode =
  | typeof CLOSE.exited
  | typeof CLOSE.environmentStopped
  | typeof CLOSE.shuttingDown
  | typeof CLOSE.internal;

/** F6: fixed reasons, so no reason is ever built from terminal output. */
export const CLOSE_REASON = {
  takenOver: "taken over",
  environmentStopped: "environment stopped",
  shuttingDown: "service shutting down",
  invalidMessage: "invalid message",
  ackExceedsSent: "ack exceeds sent",
  internal: "terminal error",
  exitUnknown: "exit unknown",
} as const;

/** F6's 4000 reason: the shell's exit code, or `exit unknown` when Docker did not report one. */
export function exitReason(exitCode: number | null): string {
  return exitCode === null ? CLOSE_REASON.exitUnknown : `exit ${exitCode}`;
}
