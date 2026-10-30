// @vitest-environment node
import { describe, expect, it } from "vitest";
import { serialised } from "@/test/serialised";
import { describeDbError } from "./db-error";

class DrizzleQueryError extends Error {
  constructor(
    readonly query: string,
    readonly params: unknown[],
    cause: unknown,
  ) {
    super(`Failed query: ${query}\nparams: ${params.join(",")}`, { cause });
    this.name = "DrizzleQueryError";
  }
}

function pgError(code: string, constraint?: string): Error {
  return Object.assign(new Error(`duplicate key value canary-token-u`), { code, constraint });
}

describe("describeDbError", () => {
  it("prints the name, the SQLSTATE and the constraint of a Drizzle error, never its message or params", () => {
    const error = new DrizzleQueryError(
      "select * from sessions where token = $1",
      ["canary-token-u"],
      pgError("23505", "sessions_token_unique"),
    );

    const line = describeDbError(error);

    expect(serialised([[line]])).not.toContain("canary-token-u");
    expect(line).toBe("DrizzleQueryError (23505, constraint sessions_token_unique)");
  });

  it("prints a Node error code such as ECONNREFUSED", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), {
      code: "ECONNREFUSED",
    });

    expect(describeDbError(error)).toBe("Error (ECONNREFUSED)");
  });

  const errorNamedByUrl = new Error("boom");
  errorNamedByUrl.name = "postgres://academy:canary-pass-dberr@h/db";
  it.each([
    { kind: "a string", value: "canary-token-u", expected: "unknown" },
    { kind: "null", value: null, expected: "unknown" },
    { kind: "an Error named with a URL", value: errorNamedByUrl, expected: "unknown" },
    { kind: "a plain Error", value: new Error("canary-token-u"), expected: "Error" },
  ])("prints only a safe name for $kind", ({ value, expected }) => {
    const line = describeDbError(value);

    expect(line).not.toContain("canary");
    expect(line).toBe(expected);
  });
});
