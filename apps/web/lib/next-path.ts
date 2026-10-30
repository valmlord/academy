// The return path after sign-in (design/flows/ia.md "Return after sign-in", sign-in AC8). Computed on
// the server; the client only ever receives the result, so a crafted `next` cannot redirect off-site.

const SIGN_IN_PATH = "/sign-in";
// Better Auth's handler and everything under it authenticate themselves.
const AUTH_API_PREFIX = "/api/auth/";
// Longer than any path of the app; a cap keeps a crafted URL from growing the redirect unbounded.
const MAX_NEXT_LENGTH = 2048;
// Browsers strip tab, CR and LF from URLs, so "/\t/evil.example" would become "//evil.example".
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** The signed-out sign-in state of design/pages/sign-in (F3.3). */
export const SIGNED_OUT_PATH = `${SIGN_IN_PATH}?signed-out=1`;

/** `value` when it is a same-origin path, else `/`. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_NEXT_LENGTH) return "/";
  if (!value.startsWith("/")) return "/";
  // "//host" and "/\host" are protocol-relative URLs to a browser.
  if (value[1] === "/" || value[1] === "\\") return "/";
  if (value.includes("\\") || CONTROL_CHARACTER.test(value)) return "/";
  return value;
}

/** The sign-in page that returns to `returnPath` (a path plus query) afterwards. */
export function signInPath(returnPath: string): string {
  return `${SIGN_IN_PATH}?next=${encodeURIComponent(returnPath)}`;
}

/** Paths the proxy lets through without a session cookie. */
export function isPublicPath(pathname: string): boolean {
  return pathname === SIGN_IN_PATH || pathname.startsWith(AUTH_API_PREFIX);
}
