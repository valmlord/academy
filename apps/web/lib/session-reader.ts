import { describeDbError } from "./db-error";

// The data access layer's session read (ADR-0008 items 4, 8, 11), with Better Auth's getSession
// injected so the logic is testable without the server-only wiring.

export interface SessionUser {
  id: string;
  email: string;
}

export interface SessionData {
  user: SessionUser;
  // The terminal ticket's connection deadline never outlives the session (#32, ADR-0011 item 3). Declared as
  // Better Auth types it; openTerminal still narrows it at runtime before use.
  session: { expiresAt: Date };
}

export interface GetSessionInput {
  headers: Headers;
  // A server render cannot set the cookie a refresh would extend, so the DB row and the cookie would
  // drift apart; the extension happens in the GET /api/auth/get-session route handler instead.
  query: { disableRefresh: true };
}

export type GetSession = (input: GetSessionInput) => Promise<SessionData | null>;

/** A failed session read, carrying only the error's name, code and constraint (no cause). */
export class SessionReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionReadError";
  }
}

export type SessionReader = (headers: Headers) => Promise<SessionData | null>;

export function createSessionReader({ getSession }: { getSession: GetSession }): SessionReader {
  return async (headers) => {
    try {
      return await getSession({ headers, query: { disableRefresh: true } });
    } catch (error: unknown) {
      // No cause: the Drizzle error under it carries the session token in its message and params.
      throw new SessionReadError(`session read failed: ${describeDbError(error)}`);
    }
  };
}
