// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type AuthSecretEnv, InvalidAuthSecretError, readAuthSecret } from "./env";

const VALID = "canary-valid-secret-".padEnd(32, "x");

function refusal(env: AuthSecretEnv): InvalidAuthSecretError {
  try {
    readAuthSecret(env);
  } catch (error: unknown) {
    if (error instanceof InvalidAuthSecretError) return error;
    throw error;
  }
  throw new Error("expected InvalidAuthSecretError, but the secret was accepted");
}

describe("readAuthSecret", () => {
  it.each([
    { kind: "undefined", secret: undefined, rule: "is missing" },
    { kind: "empty", secret: "", rule: "is missing" },
    {
      kind: "Better Auth's default",
      secret: "better-auth-secret-12345678901234567890",
      rule: "public default",
    },
    { kind: "31 characters", secret: "canary-short-".padEnd(31, "y"), rule: "got 31" },
  ])("refuses BETTER_AUTH_SECRET $kind without echoing it", ({ secret, rule }) => {
    const error = refusal({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_SECRETS: undefined });

    expect(error.message).toContain("BETTER_AUTH_SECRET");
    expect(error.message).toContain(rule);
    expect(error.message).not.toContain("canary-");
    expect(error.message).not.toContain("better-auth-secret-1234");
  });

  it.each([
    { kind: "a versioned list", secrets: "1:canary-secrets-u" },
    { kind: "blanks", secrets: "   " },
  ])("refuses BETTER_AUTH_SECRETS set to $kind even with a valid secret", ({ secrets }) => {
    const error = refusal({ BETTER_AUTH_SECRET: VALID, BETTER_AUTH_SECRETS: secrets });

    expect(error.message).toContain("BETTER_AUTH_SECRETS is not supported");
    expect(error.message).not.toContain("canary-");
  });

  it.each([undefined, ""])(
    "accepts a 32-character secret when BETTER_AUTH_SECRETS is %j",
    (secrets) => {
      expect(readAuthSecret({ BETTER_AUTH_SECRET: VALID, BETTER_AUTH_SECRETS: secrets })).toBe(
        VALID,
      );
    },
  );
});
