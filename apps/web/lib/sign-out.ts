import { describeDbError } from "./db-error";
import { SIGNED_OUT_PATH } from "./next-path";

// Sign-out (ADR-0008 item 5), with Better Auth's signOut injected so the logic is testable without the
// server-only wiring. Better Auth deletes the session row and the cookie itself, and still deletes the
// cookie when its row delete fails (it only logs that). What can still throw reaches this catch: the
// base URL resolution from Host, before Better Auth runs at all.

// Both names the proxy's getSessionCookie accepts: without either, the next request goes to sign-in.
export const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
] as const;

export interface SignOutDeps {
  signOut: () => Promise<unknown>;
  deleteCookie: (name: string) => void;
  /** Next's redirect: it throws to end the action, so it runs outside the try. */
  redirect: (path: string) => never;
  log: (line: string) => void;
}

export function createSignOut(deps: SignOutDeps): () => Promise<never> {
  return async () => {
    try {
      await deps.signOut();
    } catch (error: unknown) {
      deps.log(`web: sign-out failed: ${describeDbError(error)}`);
      for (const name of SESSION_COOKIE_NAMES) deps.deleteCookie(name);
    }
    return deps.redirect(SIGNED_OUT_PATH);
  };
}
