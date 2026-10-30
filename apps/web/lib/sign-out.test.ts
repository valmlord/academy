// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { serialised } from "@/test/serialised";
import { SIGNED_OUT_PATH } from "./next-path";
import { createSignOut, type SignOutDeps } from "./sign-out";

class RedirectSignal extends Error {}

function deps(signOut: SignOutDeps["signOut"]) {
  return {
    signOut,
    deleteCookie: vi.fn<SignOutDeps["deleteCookie"]>(),
    redirect: vi.fn<SignOutDeps["redirect"]>(() => {
      throw new RedirectSignal("redirected");
    }),
    log: vi.fn<SignOutDeps["log"]>(),
  };
}

describe("createSignOut", () => {
  it("deletes both session cookies and logs without the canary when signOut throws", async () => {
    const failure = Object.assign(new Error("Host canary-host-so is not allowed"), {
      params: ["canary-token-so"],
    });
    const signOutDeps = deps(() => Promise.reject(failure));

    await expect(createSignOut(signOutDeps)()).rejects.toBeInstanceOf(RedirectSignal);

    expect(signOutDeps.deleteCookie.mock.calls).toEqual([
      ["better-auth.session_token"],
      ["__Secure-better-auth.session_token"],
    ]);
    expect(signOutDeps.redirect).toHaveBeenCalledExactlyOnceWith(SIGNED_OUT_PATH);
    expect(signOutDeps.log).toHaveBeenCalledExactlyOnceWith("web: sign-out failed: Error");
    expect(serialised(signOutDeps.log.mock.calls)).not.toMatch(/canary/);
  });

  it("leaves the cookies to Better Auth and redirects when signOut succeeds", async () => {
    const signOutDeps = deps(() => Promise.resolve({ success: true }));

    await expect(createSignOut(signOutDeps)()).rejects.toBeInstanceOf(RedirectSignal);

    expect(signOutDeps.deleteCookie).not.toHaveBeenCalled();
    expect(signOutDeps.redirect).toHaveBeenCalledExactlyOnceWith(SIGNED_OUT_PATH);
    expect(signOutDeps.log).not.toHaveBeenCalled();
  });
});
