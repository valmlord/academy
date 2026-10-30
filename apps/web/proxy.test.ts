// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const ORIGIN = "http://127.0.0.1:3080";

function request(path: string, cookie?: string, host = "127.0.0.1:3080"): NextRequest {
  const headers: Record<string, string> = { host };
  if (cookie !== undefined) headers.cookie = cookie;
  return new NextRequest(`${ORIGIN}${path}`, { headers });
}

// NextResponse.next() marks a pass-through with this header.
function passesThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

describe("proxy", () => {
  it("redirects a request without a session cookie to sign-in with its path and query", () => {
    const response = proxy(request("/courses/a/lessons/b?tab=checks"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3080/sign-in?next=%2Fcourses%2Fa%2Flessons%2Fb%3Ftab%3Dchecks",
    );
  });

  it("keeps the host the browser used rather than Next's localhost rewrite", () => {
    const response = proxy(request("/", undefined, "127.0.0.1:3180"));

    expect(response.headers.get("location")).toBe("http://127.0.0.1:3180/sign-in?next=%2F");
  });

  it("falls back to the request URL's origin when Host is not a plain host and port", () => {
    const response = proxy(request("/", undefined, "evil.example/x"));

    expect(new URL(response.headers.get("location") ?? "").host).not.toContain("evil.example");
  });

  it("lets a request with a session cookie through", () => {
    expect(passesThrough(proxy(request("/", "better-auth.session_token=x.y")))).toBe(true);
  });

  it.each(["/sign-in", "/api/auth/get-session"])("lets %s through without a cookie", (path) => {
    expect(passesThrough(proxy(request(path)))).toBe(true);
  });
});
