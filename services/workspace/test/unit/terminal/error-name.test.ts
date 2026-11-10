import { describe, expect, it } from "vitest";
import { DockerApiError } from "../../../src/errors.js";
import { errorName } from "../../../src/terminal/session.js";

// errorName (#112): the only part of an error the terminal logs, clamped as web's relay clamps it.

function named(name: string): Error {
  const error = new Error("x");
  error.name = name;
  return error;
}

function withNameValue(value: unknown): Error {
  return Object.defineProperty(new Error("x"), "name", { value });
}

describe("errorName", () => {
  it("keeps an identifier name of at most 64 characters", () => {
    const longest = `A${"b".repeat(63)}`;

    expect(errorName(new DockerApiError("resize exec", 409))).toBe("DockerApiError");
    expect(errorName(named(longest))).toBe(longest);
  });

  it("names an Error with a longer name Error", () => {
    expect(errorName(named(`A${"b".repeat(64)}`))).toBe("Error");
  });

  it.each([
    ["an empty name", named("")],
    ["a name with a space", named("Bad name")],
    ["a name with a path", named("Error: /v1/users/canary")],
    ["a name with a newline", named("Name\nInjected")],
    ["a name with a leading digit", named("1Leading")],
    ["a non-ASCII name", named("Ünicode")],
    ["a name with a dash", named("With-dash")],
    ["a number name", withNameValue(42)],
    [
      "an object name that prints as an identifier",
      withNameValue({ toString: () => "DockerApiError" }),
    ],
    [
      "an object name whose toString throws",
      withNameValue({
        toString() {
          throw new Error("canary");
        },
      }),
    ],
  ])("names an Error whose name is not an identifier Error (%s)", (_case, error) => {
    expect(errorName(error)).toBe("Error");
  });

  it("reads an Error's name once", () => {
    let reads = 0;
    const error = Object.defineProperty(new Error("x"), "name", {
      get: () => {
        reads += 1;
        return reads <= 2 ? "Ok" : "Name\nInjected";
      },
    });

    expect(errorName(error)).toBe("Ok");
    expect(reads).toBe(1);
  });

  it.each([
    ["a string", "canary"],
    ["an object with a name", { name: "DockerApiError" }],
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
  ])("names a thrown value that is not an Error NonError (%s)", (_case, value) => {
    expect(errorName(value)).toBe("NonError");
  });
});
