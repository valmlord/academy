import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";
import { signInPath } from "./next-path";
import { createSessionReader, type SessionData } from "./session-reader";

// The data access layer (ADR-0008 item 8): every protected page calls requireSession, every route
// handler getSession plus its own 401, every server action one of them. Wiring only; the logic is in
// session-reader.ts.

const readSession = createSessionReader({
  getSession: (input) => getAuth().api.getSession(input),
});

// One database read per render: the (app) layout and its page both read the session. Outside a render
// (server actions, route handlers) cache() calls straight through.
const cachedSession = cache(async (): Promise<SessionData | null> => readSession(await headers()));

/** The signed-in user's session, or null; throws SessionReadError when the read fails. */
export async function getSession(): Promise<SessionData | null> {
  return cachedSession();
}

/** The session, or a redirect to the sign-in page that returns to `returnPath` afterwards. */
export async function requireSession(returnPath: string): Promise<SessionData> {
  const session = await getSession();
  if (session === null) redirect(signInPath(returnPath));
  return session;
}
