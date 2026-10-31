// @vitest-environment node
import { chmodSync, mkdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CourseFixture, createCourseFixture, VISIBLE_MARKER } from "@/test/course-fixture";
import { CourseFileError } from "./errors";
import { fsFailureReason, nodeCourseFs } from "./node-fs";

let fixture: CourseFixture;
const unreadablePaths: string[] = [];

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  // A failed assertion must not leave a mode-000 file for a later case.
  for (const file of unreadablePaths.splice(0)) chmodSync(file, 0o644);
  fixture.remove();
});

const THEORY = "course/00-basics/01-first/theory.md";

async function refusal(rel: string): Promise<CourseFileError> {
  const error: unknown = await nodeCourseFs.readText(fixture.root, rel).catch((e: unknown) => e);
  expect(error, rel).toBeInstanceOf(CourseFileError);
  if (!(error instanceof CourseFileError)) throw error;
  return error;
}

describe("nodeCourseFs.readText", () => {
  it("returns the text of a learner file", async () => {
    const text = await nodeCourseFs.readText(fixture.root, THEORY);

    expect(text).toContain(VISIBLE_MARKER);
  });

  it("reports a missing file as missing", async () => {
    const error = await refusal("course/00-basics/03-draft/task.md");

    expect(error.reason).toBe("missing");
    expect(error.file).toBe("course/00-basics/03-draft/task.md");
  });

  it("reports a directory as not a regular file", async () => {
    mkdirSync(fixture.path("course/00-basics/03-draft/task.md"));

    const error = await refusal("course/00-basics/03-draft/task.md");

    expect(error.reason).toBe("not a regular file");
  });

  it.each([
    ["a symlinked theory.md", "theory"],
    ["a symlinked lesson directory", "lesson-dir"],
    ["a path through ..", "dotdot"],
  ])("refuses %s as outside the course root", async (_label, variant) => {
    let rel = THEORY;
    if (variant === "theory") {
      fixture.symlink(THEORY, fixture.path("course/00-basics/02-second/checks/verify.py"));
    } else if (variant === "lesson-dir") {
      fixture.symlink("course/00-basics/01-first", fixture.path("course/00-basics/02-second"));
    } else {
      rel = "course/00-basics/../00-basics/01-first/theory.md";
    }

    const error = await refusal(rel);

    expect(error.reason).toBe("symlink or outside the course root");
  });

  it.each([
    "course/00-basics/02-second/quiz.yaml",
    "course/00-basics/02-second/checks/x.md",
    "course/00-basics/02-second/starter/task.md",
  ])("refuses %s as not a learner file", async (rel) => {
    const error = await refusal(rel);

    expect(error.reason).toBe("not a learner file");
  });

  it("reports a learner file it may not read as unreadable (EACCES)", async () => {
    // Root reads a mode-000 file, so the case would prove nothing: fail rather than skip.
    expect(process.getuid?.()).not.toBe(0);
    chmodSync(fixture.path(THEORY), 0o000);
    unreadablePaths.push(fixture.path(THEORY));

    const error = await refusal(THEORY);

    expect(error.reason).toBe("unreadable (EACCES)");
  });

  it("never puts the absolute path into a reason", async () => {
    fixture.symlink(THEORY, fixture.path("course/00-basics/02-second/checks/verify.py"));

    const errors = [await refusal(THEORY), await refusal("course/00-basics/03-draft/task.md")];

    for (const error of errors) expect(error.message).not.toContain(fixture.root);
  });
});

describe("fsFailureReason", () => {
  it.each([
    [{ code: "EIO" }, "unreadable (EIO)"],
    [{ code: "ENOTDIR" }, "missing"],
    [{ code: "ELOOP" }, "symlink or outside the course root"],
    [new TypeError("x"), undefined],
  ])("maps %o to %s", (error, reason) => {
    expect(fsFailureReason(error)).toBe(reason);
  });
});

describe("nodeCourseFs.isRegularFile and listDirs", () => {
  it("tells a regular learner file from a missing one", async () => {
    expect(await nodeCourseFs.isRegularFile(fixture.root, "course/course.yaml")).toBe(true);
    expect(await nodeCourseFs.isRegularFile(fixture.root, "other/course.yaml")).toBe(false);
  });

  it("lists the directories under the root", async () => {
    expect(await nodeCourseFs.listDirs(fixture.root, "")).toEqual(["course"]);
  });

  it("reports a missing root as the root itself", async () => {
    const error: unknown = await nodeCourseFs
      .listDirs(fixture.path("absent"), "")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CourseFileError);
    if (!(error instanceof CourseFileError)) throw error;
    expect(error.file).toBe(".");
    expect(error.reason).toBe("missing");
  });
});
