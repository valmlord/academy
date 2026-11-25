import { cp, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCourseLessons } from "../../../src/course/lessons.js";
import { CourseFileError, LessonNotFoundError } from "../../../src/errors.js";

const FIXTURE = fileURLToPath(new URL("../../fixtures/course", import.meta.url));
const MODULE_DIR = "sample-course/01-basics";
const THEORY_LESSON = `${MODULE_DIR}/02-theory-only/lesson.yaml`;

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wks-lessons-"));
  await cp(FIXTURE, root, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function readError(): Promise<CourseFileError> {
  try {
    await readCourseLessons(root);
  } catch (error) {
    if (error instanceof CourseFileError) return error;
    throw error;
  }
  throw new Error("readCourseLessons accepted the course");
}

describe("readCourseLessons", () => {
  it("yields every lesson of the fixture course", async () => {
    const course = await readCourseLessons(FIXTURE);

    expect(course.all().map((lesson) => lesson.lessonId)).toEqual([
      "with-workspace",
      "theory-only",
    ]);
  });

  it("gives a lesson with a workspace its image, starter, directory and command checks", async () => {
    const course = await readCourseLessons(FIXTURE);

    expect(course.lesson("sample-course", "with-workspace")).toEqual({
      courseId: "sample-course",
      lessonId: "with-workspace",
      lessonDir: `${MODULE_DIR}/01-with-workspace`,
      workspace: { image: "academy-workspace:dev", starter: "starter" },
      commandChecks: [{ id: "verify", run: 'sh "$ACADEMY_CHECKS_DIR/verify.sh"', timeoutSec: 30 }],
    });
  });

  it("gives a lesson without a workspace a null workspace", async () => {
    const course = await readCourseLessons(FIXTURE);

    expect(course.lesson("sample-course", "theory-only").workspace).toBeNull();
  });

  it("gives a theory lesson without checks no command checks", async () => {
    const course = await readCourseLessons(FIXTURE);

    expect(course.lesson("sample-course", "theory-only").commandChecks).toEqual([]);
  });

  it("keeps only the command checks of a lesson, in lesson order", async () => {
    const lesson = [
      "id: with-workspace",
      "title: Mixed checks",
      "type: artifact",
      "outcomes: [x]",
      "estimatedMinutes: 5",
      "status: draft",
      "workspace: { image: academy-workspace:dev, starter: starter }",
      "checks:",
      "  - { id: second, title: b, kind: command, run: 'sh b.sh', timeoutSec: 5 }",
      "  - { id: quiz, title: q, kind: quiz, file: quiz.yaml, passScore: 1 }",
      "  - { id: first, title: a, kind: command, run: 'sh a.sh', timeoutSec: 1800 }",
      "",
    ].join("\n");
    await writeFile(join(root, MODULE_DIR, "01-with-workspace/lesson.yaml"), lesson);

    const course = await readCourseLessons(root);

    expect(course.lesson("sample-course", "with-workspace").commandChecks).toEqual([
      { id: "second", run: "sh b.sh", timeoutSec: 5 },
      { id: "first", run: "sh a.sh", timeoutSec: 1800 },
    ]);
  });

  it("has no entry for an unknown lesson or course", async () => {
    const course = await readCourseLessons(FIXTURE);

    expect(course.find("sample-course", "unknown")).toBeUndefined();
    expect(course.find("other-course", "theory-only")).toBeUndefined();
    expect(() => course.lesson("sample-course", "unknown")).toThrow(LessonNotFoundError);
  });

  it("fails the whole course on a YAML warning, naming the file", async () => {
    await writeFile(join(root, THEORY_LESSON), "id: theory-only\nnote: !unknown-tag x\n");

    const error = await readError();

    expect({ file: error.file, reason: error.reason }).toEqual({
      file: THEORY_LESSON,
      reason: "invalid YAML at line 2",
    });
  });

  it("fails the whole course on one invalid lesson among valid ones, without its values", async () => {
    const invalid = [
      "id: theory-only",
      "title: Invalid",
      "type: theory",
      "outcomes: [x]",
      "estimatedMinutes: 5",
      "status: draft",
      "checks:",
      "  - { id: canary-dup, title: a, kind: bug-hunt, answers: a.yaml, minFound: 1 }",
      "  - { id: canary-dup, title: b, kind: bug-hunt, answers: b.yaml, minFound: 1 }",
      "",
    ].join("\n");
    await writeFile(join(root, THEORY_LESSON), invalid);

    const error = await readError();

    expect(error.file).toBe(THEORY_LESSON);
    expect(error.reason).toMatch(/^schema: /);
    expect(error.message).not.toContain("canary");
  });

  it("fails on a listed module that does not exist", async () => {
    await writeFile(
      join(root, "sample-course/course.yaml"),
      "id: sample-course\ntitle: S\ndescription: D\nmodules: [01-basics, 02-missing]\n",
    );

    const error = await readError();

    expect({ file: error.file, reason: error.reason }).toEqual({
      file: "sample-course/02-missing/module.yaml",
      reason: "missing",
    });
  });

  it("refuses a symlinked lesson.yaml", async () => {
    const target = join(root, "elsewhere.yaml");
    await rename(join(root, THEORY_LESSON), target);
    await symlink(target, join(root, THEORY_LESSON));

    const error = await readError();

    expect({ file: error.file, reason: error.reason }).toEqual({
      file: THEORY_LESSON,
      reason: "symlink",
    });
  });

  it("refuses a symlinked lesson directory", async () => {
    const lessonDir = join(root, MODULE_DIR, "02-theory-only");
    await rename(lessonDir, join(root, "moved-lesson"));
    await symlink(join(root, "moved-lesson"), lessonDir);

    const error = await readError();

    expect({ file: error.file, reason: error.reason }).toEqual({
      file: `${MODULE_DIR}/02-theory-only`,
      reason: "symlink",
    });
  });

  it("fails on an empty root, naming the root", async () => {
    await rm(join(root, "sample-course"), { recursive: true });

    const error = await readError();

    expect({ file: error.file, reason: error.reason }).toEqual({
      file: ".",
      reason: "expected exactly one course, found 0",
    });
  });

  it("fails on a missing root, naming the root", async () => {
    await rm(root, { recursive: true });

    expect({ ...(await readError()) }).toMatchObject({ file: ".", reason: "missing" });
  });

  it("fails on a duplicate lesson id", async () => {
    const withWorkspace = join(root, MODULE_DIR, "01-with-workspace/lesson.yaml");
    await writeFile(join(root, THEORY_LESSON), await readFile(withWorkspace));

    const error = await readError();

    expect({ file: error.file, reason: error.reason }).toEqual({
      file: THEORY_LESSON,
      reason: "duplicate lesson id with-workspace",
    });
  });
});
