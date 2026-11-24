// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { learnerFiles } from "@/lib/course/files";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  makeBrokenCourseReadable,
  readFixtureTree,
} from "@/test/course-fixture";

const TSX = path.join(import.meta.dirname, "../node_modules/.bin/tsx");
const SCRIPT = path.join(import.meta.dirname, "export-course.ts");

let fixture: CourseFixture;
let dest: string;

beforeEach(() => {
  fixture = createCourseFixture();
  dest = mkdtempSync(path.join(tmpdir(), "course-export-"));
});

afterEach(() => {
  fixture.remove();
  rmSync(dest, { recursive: true, force: true });
});

function exportCourse(...args: string[]): { code: number | null; stdout: string; stderr: string } {
  const result = spawnSync(TSX, [SCRIPT, ...args], { encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
}

async function learnerFilesOfBoth(root: string): Promise<string[]> {
  const trees = [await readFixtureTree(root, BROKEN_COURSE_ID), await readFixtureTree(root)];
  return trees.flatMap((tree) => learnerFiles(tree));
}

const BROKEN_ID_LINE =
  "export-course: CourseExportError: course broken-course: broken-course/course.yaml: id is not the directory name";

describe("export-course", () => {
  it("lists and copies the learner files of every course, nothing else", {
    timeout: 20_000,
  }, async () => {
    makeBrokenCourseReadable(fixture);
    // A listed task.md that does not exist is skipped (the draft lesson has none).
    const expected = (await learnerFilesOfBoth(fixture.root))
      .filter((rel) => rel !== "fixture-course/00-basics/03-draft/task.md")
      .sort();

    const listed = exportCourse("list", fixture.root);
    const exported = exportCourse("export", fixture.root, dest);

    expect(listed.code).toBe(0);
    expect(listed.stdout.trim().split("\n")).toEqual(expected);
    expect(exported.code).toBe(0);
    expect(filesUnder(dest)).toEqual(expected);
    expect(filesUnder(dest).filter((rel) => /checks|starter|quiz\.yaml/.test(rel))).toEqual([]);
  });

  it("fails naming a failing course, prints no path and copies nothing", {
    timeout: 20_000,
  }, () => {
    const listed = exportCourse("list", fixture.root);
    const exported = exportCourse("export", fixture.root, dest);

    expect(listed.code).toBe(1);
    expect(listed.stdout).toBe("");
    expect(listed.stderr.trim().split("\n")).toEqual([BROKEN_ID_LINE]);
    expect(exported.code).toBe(1);
    expect(filesUnder(dest)).toEqual([]);
  });

  it("fails on a root with no course", { timeout: 20_000 }, () => {
    const result = exportCourse("list", dest);

    expect(result.code).toBe(1);
    expect(result.stderr.trim()).toBe("export-course: CourseExportError: root: .: no course");
  });

  it("reports every failing course, each with its file, without file contents", {
    timeout: 20_000,
  }, () => {
    fixture.symlink(
      "fixture-course/00-basics/01-first/theory.md",
      fixture.path("fixture-course/00-basics/02-second/checks/verify.py"),
    );

    const result = exportCourse("export", fixture.root, dest);

    expect(result.code).toBe(1);
    expect(result.stderr.trim().split("\n")).toEqual([
      BROKEN_ID_LINE,
      "export-course: CourseExportError: course fixture-course: fixture-course/00-basics/01-first/theory.md: symlink or outside the course root",
    ]);
    expect(result.stderr).not.toContain("CANARY");
    expect(filesUnder(dest)).toEqual([]);
  });
});
