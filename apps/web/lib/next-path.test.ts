// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath, signInPath } from "./next-path";

describe("safeNextPath", () => {
  it.each(["/", "/courses/a/lessons/b?tab=checks", "/a/%2F%2Fb"])(
    "accepts the same-origin path %j",
    (value) => {
      expect(safeNextPath(value)).toBe(value);
    },
  );

  // Labels are separate from values, so a control character never reaches the test title.
  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["an array", ["/a", "/b"]],
    ["protocol-relative //", "//evil.example"],
    ["protocol-relative /\\", "/\\evil.example"],
    ["a backslash later", "/a\\b"],
    ["an absolute URL", "https://evil.example"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a leading tab", "\t/a"],
    ["a tab after the slash", "/\t/evil.example"],
    ["a LF after the slash", "/\n/evil.example"],
    ["a CR after the slash", "/\r/evil.example"],
    ["2049 characters", `/${"a".repeat(2048)}`],
  ])("maps %s to /", (_label, value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});

describe("signInPath", () => {
  it("encodes the whole return path into next", () => {
    expect(signInPath("/x?tab=checks")).toBe("/sign-in?next=%2Fx%3Ftab%3Dchecks");
  });
});

describe("isPublicPath", () => {
  it.each(["/sign-in", "/api/auth/x"])("lets %s through", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each(["/", "/courses/a/lessons/b", "/sign-in-x", "/api/authx", "/api"])(
    "protects %s",
    (pathname) => {
      expect(isPublicPath(pathname)).toBe(false);
    },
  );
});
