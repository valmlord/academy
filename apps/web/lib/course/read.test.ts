// @vitest-environment node
import { chmodSync, rmSync } from "node:fs";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CourseFixture, createCourseFixture, FIXTURE_COURSE_ID } from "@/test/course-fixture";
import { CourseReadError } from "./errors";
import { nodeCourseFs } from "./node-fs";
import { readCourse } from "./read";

let fixture: CourseFixture;
const unreadablePaths: string[] = [];
let channels: { calls: unknown[][] }[] = [];

beforeEach(() => {
  fixture = createCourseFixture();
  // Every channel a library could print a source line through, silenced and recorded.
  channels = [
    vi.spyOn(process, "emitWarning").mockImplementation(() => undefined),
    vi.spyOn(process.stderr, "write").mockImplementation(() => true),
    ...(["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    ),
  ].map((spy) => spy.mock);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const file of unreadablePaths.splice(0)) chmodSync(file, 0o644);
  fixture.remove();
});

const FIRST_LESSON = "course/00-basics/01-first/lesson.yaml";
const MODULE = "course/00-basics/module.yaml";
const ALIAS_REASON = "invalid YAML: alias cannot be resolved (unknown anchor or too many aliases)";

/** An anchored scalar and a flow list of `count` aliases to it, the input for the alias limit. */
function aliasList(count: number): string {
  return `a: &a 1\nl: [${Array.from({ length: count }, () => "*a").join(", ")}]\n`;
}

/** What a logger would print for every captured argument. */
function printed(): string {
  return channels
    .flatMap((channel) => channel.calls.flat())
    .map((arg) => inspect(arg, { depth: Infinity }))
    .join("\n");
}

async function readError(): Promise<CourseReadError> {
  const error: unknown = await readCourse(nodeCourseFs, fixture.root).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CourseReadError);
  if (!(error instanceof CourseReadError)) throw error;
  return error;
}

describe("readCourse", () => {
  it("reads the course, its modules and lessons with their number prefixes", async () => {
    const tree = await readCourse(nodeCourseFs, fixture.root);

    expect(tree.id).toBe(FIXTURE_COURSE_ID);
    expect(tree.modules.map((m) => m.number)).toEqual(["00", "01"]);
    expect(tree.modules[0]?.lessons.map((l) => [l.number, l.dir])).toEqual([
      ["01", "course/00-basics/01-first"],
      ["02", "course/00-basics/02-second"],
      ["03", "course/00-basics/03-draft"],
    ]);
    expect(printed()).toBe("");
  });

  it("names a schema failure by path and code, never by a message that echoes the value", async () => {
    fixture.write(
      "course/00-basics/02-second/lesson.yaml",
      `id: second-lesson
title: Second lesson
type: theory
outcomes: [x]
estimatedMinutes: 5
status: draft
checks:
  - { id: canary-dup, kind: command, title: a, run: a, timeoutSec: 1 }
  - { id: canary-dup, kind: command, title: b, run: b, timeoutSec: 1 }
workspace: { image: x }
`,
    );

    const error = await readError();

    expect(error.message).toBe("course/00-basics/02-second/lesson.yaml: schema: checks custom");
    expect(inspect(error)).not.toContain("canary-dup");
  });

  it("reports a YAML error by line number without the source line", async () => {
    fixture.write(FIRST_LESSON, "id: first-lesson\ntitle: First\nrun: [CANARY-YAML-E}\n");

    const error = await readError();

    expect(inspect(error)).not.toContain("CANARY");
    expect(printed()).not.toContain("CANARY");
    expect(error.reason).toBe("invalid YAML at line 3");
  });

  it("fails closed on a YAML warning and prints it nowhere", async () => {
    fixture.write(FIRST_LESSON, "id: first-lesson\ntitle: First\nrun: !weird CANARY-YAML-W\n");

    const result: unknown = await readCourse(nodeCourseFs, fixture.root).catch((e: unknown) => e);

    expect(printed()).not.toContain("CANARY");
    expect(result).toBeInstanceOf(CourseReadError);
    expect(result).toMatchObject({ reason: expect.stringMatching(/^invalid YAML at line \d+$/) });
  });

  it("refuses a second YAML document", async () => {
    fixture.write(FIRST_LESSON, "id: first-lesson\n---\nid: other\n");

    const error = await readError();

    expect(error.reason).toBe("invalid YAML at line 2");
  });

  it("never prints a collection key", async () => {
    fixture.write(FIRST_LESSON, "id: x\n? [CANARY-KEY]\n: v\n");

    const result: unknown = await readCourse(nodeCourseFs, fixture.root).catch((e: unknown) => e);

    expect(printed()).not.toContain("CANARY-KEY");
    expect(inspect(result, { depth: Infinity })).not.toContain("CANARY-KEY");
  });

  it("reports an alias without an anchor by a fixed reason, printing the alias nowhere", async () => {
    fixture.write(FIRST_LESSON, "id: first-lesson\ntitle: First\nsummary: *CANARY-ALIAS\n");

    const error = await readError();

    expect(error.file).toBe(FIRST_LESSON);
    expect(error.reason).toBe(ALIAS_REASON);
    expect(inspect(error)).not.toContain("CANARY");
    expect(printed()).not.toContain("CANARY");
  });

  it("reports one hundred aliases to one anchor as an alias failure", async () => {
    fixture.write(FIRST_LESSON, `id: first-lesson\n${aliasList(100)}`);

    const error = await readError();

    expect(error.reason).toBe(ALIAS_REASON);
  });

  it("reports a YAML 1.1 merge key without a map source by a fixed reason", async () => {
    fixture.write(FIRST_LESSON, "%YAML 1.1\n---\nid: first-lesson\nmeta:\n  <<: 5\n");

    const error = await readError();

    expect(error.reason).toBe("invalid YAML: document cannot be converted to a value");
    expect(inspect(error)).not.toContain("Merge sources");
    expect(printed()).not.toContain("Merge sources");
  });

  it("refuses a symlinked lesson.yaml", async () => {
    fixture.symlink(FIRST_LESSON, fixture.path("course/00-basics/02-second/lesson.yaml"));

    const error = await readError();

    expect(error.file).toBe(FIRST_LESSON);
    expect(error.reason).toBe("symlink or outside the course root");
  });

  it("reports a module.yaml it may not read, keeping the course id", async () => {
    expect(process.getuid?.()).not.toBe(0);
    chmodSync(fixture.path(MODULE), 0o000);
    unreadablePaths.push(fixture.path(MODULE));

    const error = await readError();

    expect(error.reason).toBe("unreadable (EACCES)");
    expect(error.courseId).toBe(FIXTURE_COURSE_ID);
  });

  it("reports a missing module.yaml, keeping the course id", async () => {
    rmSync(fixture.path(MODULE));

    const error = await readError();

    expect(error.message).toBe(`${MODULE}: missing`);
    expect(error.courseId).toBe(FIXTURE_COURSE_ID);
  });

  it("has no course id when course.yaml itself is invalid", async () => {
    fixture.write("course/course.yaml", "id: Not A Slug\n");

    const error = await readError();

    expect(error.file).toBe("course/course.yaml");
    expect(error.courseId).toBeUndefined();
  });

  it("refuses a duplicate lesson id", async () => {
    fixture.write(
      "course/01-later/01-hidden/lesson.yaml",
      "id: first-lesson\ntitle: T\ntype: theory\noutcomes: [x]\nestimatedMinutes: 5\nstatus: draft\n",
    );

    const error = await readError();

    expect(error.message).toBe(
      "course/01-later/01-hidden/lesson.yaml: duplicate lesson id first-lesson",
    );
  });

  it("names a missing course root as the root, not as an empty file name", async () => {
    const error: unknown = await readCourse(nodeCourseFs, fixture.path("absent")).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(CourseReadError);
    if (!(error instanceof CourseReadError)) throw error;
    expect(error.file).toBe(".");
    expect(error.message).toBe(".: missing");
  });

  it.each([
    ["zero", () => rmSync(fixture.path("course/course.yaml")), 0],
    ["two", () => fixture.write("second/course.yaml", "id: second\n"), 2],
  ])("refuses %s courses", async (_label, arrange, count) => {
    arrange();

    const error = await readError();

    expect(error.reason).toBe(`expected exactly one course, found ${count}`);
  });
});
