import { describe, expect, it } from "vitest";
import { errorCode, errorKind, errorKindAndCode, errorName } from "../../src/log-fields.js";

// #121: every field these helpers take from a thrown value is clamped, and no helper throws.

const CANARIES = ["INJECT", "canary"];

/** An Error of a fresh subclass whose `name` (the constructor name) is defined by `descriptor`. */
function classNamed(descriptor: PropertyDescriptor): Error {
  const ErrorClass = Object.defineProperty(class extends Error {}, "name", descriptor);
  return new ErrorClass("x");
}

function withOwn(property: string, descriptor: PropertyDescriptor): Error {
  return Object.defineProperty(new Error("x"), property, descriptor);
}

function throwing(): never {
  throw new Error("canary");
}

/** An Error whose every property read throws, through a Proxy `get` trap. */
function proxyWithThrowingGet(): Error {
  return new Proxy(new Error("x"), { get: throwing });
}

/** A value whose `instanceof` check throws, through a Proxy `getPrototypeOf` trap. */
function proxyWithThrowingPrototype(target: object): object {
  return new Proxy(target, { getPrototypeOf: throwing });
}

describe("errorCode", () => {
  it.each([["ENOENT"], ["WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"], [`A${"B".repeat(63)}`]])(
    "keeps a code of capitals, digits and underscores of at most 64 characters (%s)",
    (code) => {
      expect(errorCode(Object.assign(new Error("x"), { code }))).toBe(code);
    },
  );

  it.each([
    ["65 characters", `A${"B".repeat(64)}`],
    ["lower case", "lower"],
    ["a lower-case first letter", "eNOENT"],
    ["a leading digit", "1ABC"],
    ["a leading underscore", "_A"],
    ["a newline", "A\nB"],
    ["a space", "A B"],
    ["a number", 20],
    ["an object that prints as a code", { toString: () => "ECODE" }],
  ])("gives null for a code that is not a valid code (%s)", (_case, code) => {
    expect(errorCode(Object.assign(new Error("x"), { code }))).toBeNull();
  });

  it("gives null when reading the code throws", () => {
    expect(errorCode(withOwn("code", { get: throwing }))).toBeNull();
    expect(errorCode(proxyWithThrowingGet())).toBeNull();
  });

  it.each([
    ["a string", "ENOENT"],
    ["null", null],
    ["undefined", undefined],
  ])("gives null for a thrown value that is not an object (%s)", (_case, value) => {
    expect(errorCode(value)).toBeNull();
  });

  it("reads the code once", () => {
    let reads = 0;
    const error = withOwn("code", {
      get: () => {
        reads += 1;
        return reads === 1 ? "ECODE" : "bad\ncode";
      },
    });

    expect(errorCode(error)).toBe("ECODE");
    expect(reads).toBe(1);
  });
});

describe("errorKind", () => {
  it("keeps the constructor name of a built-in error", () => {
    expect(errorKind(new TypeError("x"))).toBe("TypeError");
  });

  it("keeps the constructor name of a subclass that does not set this.name, unlike errorName", () => {
    class Foo extends Error {}
    const error = new Foo("x");

    expect(errorKind(error)).toBe("Foo");
    expect(errorName(error)).toBe("Error");
  });

  it("keeps an identifier constructor name of 64 characters", () => {
    const longest = `A${"b".repeat(63)}`;

    expect(errorKind(classNamed({ value: longest }))).toBe(longest);
  });

  it.each([
    ["an empty name", classNamed({ value: "" })],
    ["a newline", classNamed({ value: "Evil name\nINJECT" })],
    ["a number", classNamed({ value: 42 })],
    ["a Symbol", classNamed({ value: Symbol("s") })],
    ["65 characters", classNamed({ value: `A${"b".repeat(64)}` })],
    ["a non-ASCII name", classNamed({ value: "Ünicode" })],
    ["a throwing name getter", classNamed({ get: throwing })],
    ["an undefined constructor", withOwn("constructor", { value: undefined })],
    ["a null constructor", withOwn("constructor", { value: null })],
    ["a string constructor", withOwn("constructor", { value: "str" })],
    ["a throwing constructor getter", withOwn("constructor", { get: throwing })],
    ["a Proxy whose get trap throws", proxyWithThrowingGet()],
  ])("names an Error whose constructor name is not an identifier Error (%s)", (_case, error) => {
    expect(errorKind(error)).toBe("Error");
  });

  it.each([
    ["a string", "canary", "string"],
    ["null", null, "object"],
    ["undefined", undefined, "undefined"],
    ["a plain object", { code: "E" }, "object"],
    ["a Proxy whose getPrototypeOf trap throws", proxyWithThrowingPrototype({}), "object"],
  ])("gives typeof for a thrown value that is not an Error (%s)", (_case, value, expected) => {
    expect(errorKind(value)).toBe(expected);
  });

  it("reads the constructor once", () => {
    let reads = 0;
    const Ok = Object.defineProperty(class extends Error {}, "name", { value: "Ok" });
    const Bad = Object.defineProperty(class extends Error {}, "name", { value: "Bad\nname" });
    const error = withOwn("constructor", {
      get: () => {
        reads += 1;
        return reads === 1 ? Ok : Bad;
      },
    });

    expect(errorKind(error)).toBe("Ok");
    expect(reads).toBe(1);
  });

  it("reads the constructor's name once", () => {
    let reads = 0;
    const error = classNamed({
      get: () => {
        reads += 1;
        return reads === 1 ? "Ok" : "Bad\nname";
      },
    });

    expect(errorKind(error)).toBe("Ok");
    expect(reads).toBe(1);
  });

  it("never returns the canary text of an input", () => {
    const inputs: unknown[] = [
      classNamed({ value: "Evil name\nINJECT" }),
      classNamed({ value: "canary class" }),
      "canary",
    ];

    for (const input of inputs) {
      const kind = errorKind(input);
      for (const canary of CANARIES) expect(kind).not.toContain(canary);
    }
  });
});

describe("errorKindAndCode", () => {
  it.each([
    [
      "an Error with a valid code",
      Object.assign(new Error("x"), { code: "EADDRINUSE" }),
      "Error (EADDRINUSE)",
    ],
    [
      "an Error with an invalid code",
      Object.assign(new TypeError("x"), { code: "bad code" }),
      "TypeError",
    ],
    [
      "a hostile class with a hostile code",
      Object.assign(classNamed({ value: "Evil\nINJECT" }), { code: "A\nB" }),
      "Error",
    ],
    ["a thrown string", "canary", "string"],
    ["a thrown object with a valid code", { code: "EACCES" }, "object (EACCES)"],
  ])("prints the kind and a valid code only (%s)", (_case, value, expected) => {
    expect(errorKindAndCode(value)).toBe(expected);
  });
});
