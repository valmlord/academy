// ADR-0008 item 11 (L2): Better Auth's logger passes raw errors as extra arguments and may put a
// Drizzle message (with its query parameters: session tokens, password hashes) into the message
// itself. Every line keeps only the first line of the message and never an argument.

export type AuthLogLevel = "debug" | "info" | "warn" | "error";

export type AuthLog = (level: AuthLogLevel, message: string, ...args: unknown[]) => void;

// Drizzle formats a failed query as "Failed query: <sql>\nparams: <values>" (drizzle-orm 0.45
// errors.js); either marker anywhere withholds the whole message.
const DRIZZLE_MESSAGE_MARKERS = ["Failed query", "params:"];
const WITHHELD = "database error (details withheld)";

/** Better Auth's `logger.log` option, writing one redacted line per call to `sink`. */
export function createAuthLog(sink: (line: string) => void): AuthLog {
  return (level, message) => {
    sink(`better-auth ${level}: ${redact(message)}`);
  };
}

function redact(message: string): string {
  if (DRIZZLE_MESSAGE_MARKERS.some((marker) => message.includes(marker))) return WITHHELD;
  return message.split(/\r?\n/, 1)[0] ?? "";
}
