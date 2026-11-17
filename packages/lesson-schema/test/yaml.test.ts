import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateCourses } from "../src/validate.js";
import { type CourseYamlParse, courseYamlReason, parseCourseYaml } from "../src/yaml.js";

const WARNING_TAG = "id: one\nextra: !CANARY-TAG CANARY-W\n";
const UNKNOWN_ALIAS = "id: one\nref: *CANARY-ALIAS\n";
const MERGE_NON_MAP = "%YAML 1.1\n---\nid: one\nm:\n  <<: 5\n";

/** An anchored scalar and a flow list of `count` aliases to it, the input for the alias limit. */
function aliasList(count: number): string {
  return `a: &a 1\nl: [${Array.from({ length: count }, () => "*a").join(", ")}]\n`;
}

function conversionError(result: CourseYamlParse): unknown {
  expect(result.kind).toBe("conversion");
  if (result.kind !== "conversion")
    throw new Error(`expected a conversion failure, got ${result.kind}`);
  return result.error;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseCourseYaml", () => {
  it("returns the value of a document with no error or warning", () => {
    const result = parseCourseYaml("id: one\nlist: [a, b]\n");

    expect(result).toStrictEqual({ kind: "value", value: { id: "one", list: ["a", "b"] } });
  });

  it("reports a parse error by its line and library code only", () => {
    const text =
      "id: intro\ntitle: Intro\nsummary: s\nstatus: ready\nlessons: [01-agents-md]\ntitle: Again\n";

    const result = parseCourseYaml(text);

    expect(result).toStrictEqual({ kind: "parse", line: 6, code: "DUPLICATE_KEY" });
  });

  it("fails closed on a warning, by its line and code", () => {
    const result = parseCourseYaml(WARNING_TAG);

    expect(result).toStrictEqual({ kind: "parse", line: 2, code: "TAG_RESOLVE_FAILED" });
  });

  it("reports the first error before any warning", () => {
    const result = parseCourseYaml("id: one\nextra: !foo x\nextra: y\n");

    expect(result).toStrictEqual({ kind: "parse", line: 3, code: "DUPLICATE_KEY" });
  });

  it("reports a second document at the line where it starts", () => {
    const result = parseCourseYaml("id: one\n---\nid: two\n");

    expect(result).toStrictEqual({ kind: "parse", line: 2, code: "MULTIPLE_DOCS" });
  });

  it("prints no collection key through process warnings or the console", () => {
    const spies = [
      vi.spyOn(process, "emitWarning").mockImplementation(() => undefined),
      ...(["log", "info", "warn", "error", "debug"] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      ),
    ];

    const result = parseCourseYaml("id: x\n? [CANARY-KEY]\n: v\n");

    expect(result.kind).toBe("value");
    const printed = spies.flatMap((spy) =>
      spy.mock.calls.map((args) => inspect(args, { depth: Infinity })),
    );
    expect(printed.filter((line) => line.includes("CANARY-KEY"))).toStrictEqual([]);
  });

  it("reports an alias without an anchor as an alias failure that carries nothing else", () => {
    const result = parseCourseYaml(UNKNOWN_ALIAS);

    expect(result).toStrictEqual({ kind: "alias" });
  });

  it("reports one hundred aliases to one scalar anchor as an alias failure", () => {
    const result = parseCourseYaml(aliasList(100));

    expect(result).toStrictEqual({ kind: "alias" });
  });

  it("accepts ninety-nine aliases to one scalar anchor", () => {
    const result = parseCourseYaml(aliasList(99));

    expect(result).toStrictEqual({ kind: "value", value: { a: 1, l: Array(99).fill(1) } });
  });

  it("reports a YAML 1.1 merge of a non-map as a conversion failure carrying the library's error", () => {
    const result = parseCourseYaml(MERGE_NON_MAP);

    const error = conversionError(result);
    expect(Object.keys(result)).toStrictEqual(["kind", "error"]);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ReferenceError);
    if (!(error instanceof Error)) throw error;
    expect(error.message).toContain("Merge sources");
  });

  it("reports an unresolved alias used as a YAML 1.1 merge source as a conversion failure", () => {
    const result = parseCourseYaml("%YAML 1.1\n---\nid: one\nm:\n  <<: *nope\n");

    const error = conversionError(result);
    expect(error).not.toBeInstanceOf(ReferenceError);
  });

  it.each([
    ["a parse error", "id: one\nrun: [CANARY-E}\n"],
    ["a warning", WARNING_TAG],
    ["an unknown alias", UNKNOWN_ALIAS],
  ])("keeps file text out of the result of %s", (_name, text) => {
    const result = parseCourseYaml(text);

    expect(result.kind).not.toBe("value");
    expect(result.kind).not.toBe("conversion");
    expect(inspect(result, { depth: Infinity })).not.toContain("CANARY");
  });
});

describe("courseYamlReason", () => {
  it("names the line of a parse failure and not its code", () => {
    const reason = courseYamlReason({ kind: "parse", line: 3, code: "BAD_INDENT" });

    expect(reason).toBe("invalid YAML at line 3");
  });

  it("gives an alias failure the reason content:validate and both loaders share", () => {
    const reason = courseYamlReason({ kind: "alias" });

    expect(reason).toBe(
      "invalid YAML: alias cannot be resolved (unknown anchor or too many aliases)",
    );
  });

  it("gives a conversion failure a fixed reason without reading the carried error", () => {
    const refuse = (): never => {
      throw new Error("courseYamlReason read the carried error");
    };
    const handler: ProxyHandler<object> = {
      get: refuse,
      has: refuse,
      ownKeys: refuse,
      getOwnPropertyDescriptor: refuse,
      getPrototypeOf: refuse,
    };
    const error = new Proxy({}, handler);

    const reason = courseYamlReason({ kind: "conversion", error });

    expect(reason).toBe("invalid YAML: document cannot be converted to a value");
  });
});

describe("validateCourses on a document that cannot be converted", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("rethrows the library's error for a YAML 1.1 merge of a non-map", () => {
    root = mkdtempSync(join(tmpdir(), "lesson-schema-yaml-"));
    mkdirSync(join(root, "c"));
    writeFileSync(join(root, "c", "course.yaml"), MERGE_NON_MAP);
    const courseRoot = root;

    let thrown: unknown;
    try {
      validateCourses(courseRoot);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(ReferenceError);
    if (!(thrown instanceof Error)) throw thrown;
    expect(thrown.message).toContain("Merge sources");
  });
});
