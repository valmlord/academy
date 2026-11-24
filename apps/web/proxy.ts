import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { forwardedRequestHeaders, isPublicPath, signInPath } from "./lib/next-path";

// Default deny, optimistic only (ADR-0008 item 8): a request without a session cookie goes to sign-in
// with its path and query as `next`. A forged cookie passes here; the data access layer in every page,
// action and route handler is the real check.
// 307 keeps the method, so a redirected POST is never replayed as a GET.
const TEMPORARY_REDIRECT = 307;

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || getSessionCookie(request) !== null) {
    return NextResponse.next({ request: { headers: forwardedRequestHeaders(request) } });
  }
  return NextResponse.redirect(
    signInUrl(request, signInPath(pathname + search)),
    TEMPORARY_REDIRECT,
  );
}

// Next's middleware adapter parses the Location with `new URL`, so it must be absolute. NextRequest
// rewrites 127.0.0.1 to localhost in `nextUrl`; the cookie the browser holds belongs to the host it
// actually used, so the target keeps the request's own Host. That Host came from this same client,
// so honouring it redirects nobody else. A Host that is not a plain host[:port] keeps nextUrl's.
function signInUrl(request: NextRequest, path: string): URL {
  const target = new URL(path, request.nextUrl.origin);
  const host = request.headers.get("host");
  if (host === null) return target;
  const candidate = `${target.protocol}//${host}`;
  if (!URL.canParse(candidate)) return target;
  const own = new URL(candidate);
  if (own.host === host.toLowerCase()) target.host = own.host;
  return target;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
