// The custom server's fixed log lines and error messages (#32 design 3.8, F1-F4), written once here; the tests
// import them and compare whole lines. No placeholder ever receives an error message, a header or a URL.

/** F1: `start()` rejected; `message` is the error's own message only for the classes 3.8 names. */
export function startupFailedLine(errorName: string, message: string): string {
  return `web: startup failed: ${errorName}: ${message}`;
}

/** F1b: the public server emitted `error` (EADDRINUSE at listen, EMFILE later). */
export function serverErrorLine(errorName: string, code: string | undefined): string {
  return `web: server error: ${errorName} (${code ?? "-"})`;
}

/** F2a-F2c: `StandaloneConfigError` messages. */
export const CONFIG_MISSING = ".next/required-server-files.json missing";
export const CONFIG_NOT_JSON = ".next/required-server-files.json is not JSON";
export const CONFIG_NO_OBJECT = ".next/required-server-files.json has no config object";

/** F3a, F3b: `NextServerShapeError` messages. */
export const NEXT_NOT_FUNCTION = "next export is not a function";
export type NextAppMember = "prepare" | "getRequestHandler" | "close";
export function nextAppMissingMessage(member: NextAppMember): string {
  return `next app has no ${member}`;
}

/** Reasons of F4a; `contained` is the log limiter's reason for F4d. */
export type RefusalReason =
  | "bad-request"
  | "forbidden-host"
  | "forbidden-origin"
  | "bad-ticket"
  | "unconfigured";
export type LimitedReason = RefusalReason | "contained";

/** F4a */
export function refusedLine(conn: string, reason: RefusalReason): string {
  return `terminal relay ${conn}: refused (${reason})`;
}

/** F4b: `detail` is a system error code or an upstream HTTP status. */
export function upstreamFailedLine(conn: string, detail: string): string {
  return `terminal relay ${conn}: upstream failed (${detail})`;
}

/** F4c */
export function cutAtDeadlineLine(conn: string): string {
  return `terminal relay ${conn}: cut at deadline`;
}

/** F4d */
export function containedLine(conn: string, errorName: string): string {
  return `terminal relay ${conn}: error contained (${errorName})`;
}

/** F4e: printed by the log limiter's timer at the end of a 10 s window that suppressed lines. */
export function suppressedLine(count: number, reason: LimitedReason): string {
  return `terminal relay: ${count} lines (${reason}) suppressed in the last 10 s`;
}
