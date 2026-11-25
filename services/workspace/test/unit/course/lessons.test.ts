import { cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CourseLessons,
  type EveryCourse,
  readCourseById,
  readEveryCourse,
} from "../../../src/course/lessons.js";
import { CourseReadError, CourseRootReadError, LessonNotFoundError } from "../../../src/errors.js";
import { twoCourseRoot } from "../../support/course-root.js";

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

const SAMPLE = "sample-course";

/** The fixture course as ensure reads it; a test that gets `null` fails here. */
async function readSample(courseRoot: string): Promise<CourseLessons> {
  const course = await readCourseById(courseRoot, SAMPLE);
  if (course === null) throw new Error(`the root lists no ${SAMPLE}`);
  return course;
}

async function readError(): Promise<CourseReadError> {
  try {
    await readCourseById(root, SAMPLE);
  } catch (error) {
    if (error instanceof CourseReadError) return error;
    throw error;
  }
  throw new Error("readCourseById accepted the course");
}

async function rootError(courseRoot: string): Promise<CourseRootReadError> {
  try {
    await readCourseById(courseRoot, SAMPLE);
  } catch (error) {
    if (error instanceof CourseRootReadError) return error;
    throw error;
  }
  throw new Error("readCourseById accepted the root");
}

describe("readCourseById on the fixture root", () => {
  it("yields every lesson of the fixture course", async () => {
    const course = await readSample(FIXTURE);

    expect(course.all().map((lesson) => lesson.lessonId)).toEqual([
      "with-workspace",
      "theory-only",
    ]);
  });

  it("gives a lesson with a workspace its image, starter, directory and command checks", async () => {
    const course = await readSample(FIXTURE);

    expect(course.lesson("sample-course", "with-workspace")).toEqual({
      courseId: "sample-course",
      lessonId: "with-workspace",
      lessonDir: `${MODULE_DIR}/01-with-workspace`,
      workspace: { image: "academy-workspace:dev", starter: "starter" },
      commandChecks: [{ id: "verify", run: 'sh "$ACADEMY_CHECKS_DIR/verify.sh"', timeoutSec: 30 }],
    });
  });

  it("gives a lesson without a workspace a null workspace", async () => {
    const course = await readSample(FIXTURE);

    expect(course.lesson("sample-course", "theory-only").workspace).toBeNull();
  });

  it("gives a theory lesson without checks no command checks", async () => {
    const course = await readSample(FIXTURE);

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

    const course = await readSample(root);

    expect(course.lesson("sample-course", "with-workspace").commandChecks).toEqual([
      { id: "second", run: "sh b.sh", timeoutSec: 5 },
      { id: "first", run: "sh a.sh", timeoutSec: 1800 },
    ]);
  });

  it("has no entry for an unknown lesson or course", async () => {
    const course = await readSample(FIXTURE);

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
    expect(error.message).toBe(
      "course sample-course: sample-course/02-missing/module.yaml: missing",
    );
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

  it("fails the root when it lists no course, naming the root", async () => {
    await rm(join(root, "sample-course"), { recursive: true });

    const error = await rootError(root);

    expect(error.message).toBe("root: .: no course");
  });

  it("fails the root when it is missing, naming the root", async () => {
    await rm(root, { recursive: true });

    expect({ ...(await rootError(root)) }).toMatchObject({ file: ".", reason: "missing" });
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

/** Each listed course as its kind, id and, for a failure, the operator message. */
function summary(every: EveryCourse): unknown {
  if (every.kind === "root-failure") return { kind: every.kind, message: every.error.message };
  return every.courses.map((listed) =>
    listed.kind === "course"
      ? { kind: listed.kind, courseId: listed.courseId }
      : { kind: listed.kind, courseId: listed.courseId, message: listed.error.message },
  );
}

describe("several courses under one root", () => {
  let courses: string;

  beforeEach(async () => {
    courses = await twoCourseRoot();
  });

  afterEach(async () => {
    await rm(courses, { recursive: true, force: true });
  });

  it("readEveryCourse lists every real directory as a course in name order and reads both", async () => {
    await writeFile(join(courses, "notes.md"), "not a course\n");
    await symlink(join(courses, "sample-course"), join(courses, "linked"));

    const every = await readEveryCourse(courses);

    expect(summary(every)).toEqual([
      { kind: "course", courseId: "other-course" },
      { kind: "course", courseId: "sample-course" },
    ]);
    if (every.kind !== "courses") return;
    const lessons = every.courses.flatMap((listed) =>
      listed.kind === "course" ? listed.lessons.all() : [],
    );
    expect(lessons.map((lesson) => [lesson.courseId, lesson.lessonDir])).toEqual([
      ["other-course", "other-course/01-basics/01-with-workspace"],
      ["other-course", "other-course/01-basics/02-theory-only"],
      ["sample-course", "sample-course/01-basics/01-with-workspace"],
      ["sample-course", "sample-course/01-basics/02-theory-only"],
    ]);
  });

  it("readCourseById reads only the named course and leaves another failing course alone", async () => {
    await rm(join(courses, "other-course/course.yaml"));

    const course = await readCourseById(courses, SAMPLE);

    expect(course?.all().map((lesson) => lesson.lessonId)).toEqual([
      "with-workspace",
      "theory-only",
    ]);
  });

  it("a directory without course.yaml is a failing course and the other reads", async () => {
    await rm(join(courses, "other-course/course.yaml"));

    expect(summary(await readEveryCourse(courses))).toEqual([
      {
        kind: "course-failure",
        courseId: "other-course",
        message: "course other-course: other-course/course.yaml: missing",
      },
      { kind: "course", courseId: SAMPLE },
    ]);
  });

  it("a symlinked course.yaml fails only its course, as symlink", async () => {
    const file = join(courses, "other-course/course.yaml");
    await rename(file, join(courses, "elsewhere.yaml"));
    await symlink(join(courses, "elsewhere.yaml"), file);

    expect(summary(await readEveryCourse(courses))).toEqual([
      {
        kind: "course-failure",
        courseId: "other-course",
        message: "course other-course: other-course/course.yaml: symlink",
      },
      { kind: "course", courseId: SAMPLE },
    ]);
  });

  it("a non-slug directory fails before any file is opened", async () => {
    await mkdir(join(courses, "Not A Slug"));

    const every = await readEveryCourse(courses);

    expect(summary(every)).toEqual([
      {
        kind: "course-failure",
        courseId: "Not A Slug",
        message: 'course "Not A Slug": .: directory name is not a course id',
      },
      { kind: "course", courseId: "other-course" },
      { kind: "course", courseId: SAMPLE },
    ]);
  });

  it("a course.yaml whose id is not its directory name fails before module.yaml", async () => {
    await writeFile(
      join(courses, "other-course/course.yaml"),
      "id: sample-course\ntitle: O\ndescription: D\nmodules: [01-basics]\n",
    );
    await rm(join(courses, "other-course/01-basics/module.yaml"));

    expect(summary(await readEveryCourse(courses))).toEqual([
      {
        kind: "course-failure",
        courseId: "other-course",
        message: "course other-course: other-course/course.yaml: id is not the directory name",
      },
      { kind: "course", courseId: SAMPLE },
    ]);
  });

  it("readCourseById returns null for a slug the root does not list, opening no file", async () => {
    await expect(readCourseById(courses, "ghost-course")).resolves.toBeNull();
  });

  it("readCourseById returns null for a symlink at the root named like the id", async () => {
    await symlink(join(courses, "sample-course"), join(courses, "linked-course"));

    await expect(readCourseById(courses, "linked-course")).resolves.toBeNull();
  });

  it("readCourseById returns null for an id not in the course id form, even when a directory has that name", async () => {
    await cp(join(courses, "sample-course"), join(courses, "Not A Slug"), { recursive: true });

    await expect(readCourseById(courses, "Not A Slug")).resolves.toBeNull();
  });

  it("a missing root, a root that is a file and a root with no directory are root failures", async () => {
    const missing = join(courses, "missing-root");
    const file = join(courses, "notes.md");
    await writeFile(file, "not a root\n");
    const noDirectory = join(courses, "files-only");
    await mkdir(noDirectory);
    await writeFile(join(noDirectory, "notes.md"), "not a course\n");

    const results = [
      summary(await readEveryCourse(missing)),
      summary(await readEveryCourse(file)),
      summary(await readEveryCourse(noDirectory)),
    ];

    expect(results).toEqual([
      { kind: "root-failure", message: "root: .: missing" },
      { kind: "root-failure", message: "root: .: not-a-directory" },
      { kind: "root-failure", message: "root: .: no course" },
    ]);
  });

  it("a lesson id repeated within one course fails that course; the same id in two courses does not", async () => {
    expect(summary(await readEveryCourse(courses))).toEqual([
      { kind: "course", courseId: "other-course" },
      { kind: "course", courseId: SAMPLE },
    ]);
    const withWorkspace = join(courses, MODULE_DIR, "01-with-workspace/lesson.yaml");
    await writeFile(join(courses, THEORY_LESSON), await readFile(withWorkspace));

    expect(summary(await readEveryCourse(courses))).toEqual([
      { kind: "course", courseId: "other-course" },
      {
        kind: "course-failure",
        courseId: SAMPLE,
        message: `course sample-course: ${THEORY_LESSON}: duplicate lesson id with-workspace`,
      },
    ]);
  });
});
