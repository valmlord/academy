// @vitest-environment node
import { chmodSync, rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CourseFixture, createCourseFixture } from "@/test/course-fixture";
import { LessonTextReadError } from "./errors";
import { nodeCourseFs } from "./node-fs";
import { readLessonText } from "./text";

let fixture: CourseFixture;
const unreadablePaths: string[] = [];

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  for (const file of unreadablePaths.splice(0)) chmodSync(file, 0o644);
  fixture.remove();
});

const LESSON = "course/00-basics/01-first";
const THEORY = `${LESSON}/theory.md`;

async function textError(): Promise<unknown> {
  return readLessonText(nodeCourseFs, fixture.root, LESSON, "theory").catch((e: unknown) => e);
}

describe("readLessonText", () => {
  it("reports a missing theory.md as a lesson text error", async () => {
    rmSync(fixture.path(THEORY));

    const error = await textError();

    expect(error).toBeInstanceOf(LessonTextReadError);
    expect(error).toMatchObject({ file: THEORY, reason: "missing" });
  });

  it("reports a symlinked theory.md as a lesson text error", async () => {
    fixture.symlink(THEORY, fixture.path("course/00-basics/02-second/checks/verify.py"));

    const error = await textError();

    expect(error).toBeInstanceOf(LessonTextReadError);
    expect(error).toMatchObject({ reason: "symlink or outside the course root" });
  });

  it("reports a theory.md it may not read as unreadable", async () => {
    expect(process.getuid?.()).not.toBe(0);
    chmodSync(fixture.path(THEORY), 0o000);
    unreadablePaths.push(fixture.path(THEORY));

    const error = await textError();

    expect(error).toBeInstanceOf(LessonTextReadError);
    expect(error).toMatchObject({ reason: "unreadable (EACCES)" });
  });
});
