// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CourseFixture, createCourseFixture } from "@/test/course-fixture";

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

describe("export-course", () => {
  it("copies exactly the files list prints", { timeout: 20_000 }, () => {
    const listed = exportCourse("list", fixture.root);

    const exported = exportCourse("export", fixture.root, dest);

    expect(exported.code).toBe(0);
    expect(filesUnder(dest)).toEqual(listed.stdout.trim().split("\n"));
    expect(filesUnder(dest)).not.toContain("course/00-basics/02-second/quiz.yaml");
  });

  it("stops on a symlinked theory.md naming the file, without file contents", {
    timeout: 20_000,
  }, () => {
    fixture.symlink(
      "course/00-basics/01-first/theory.md",
      fixture.path("course/00-basics/02-second/checks/verify.py"),
    );

    const result = exportCourse("export", fixture.root, dest);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "CourseExportError: course/00-basics/01-first/theory.md: symlink or outside the course root",
    );
    expect(result.stderr).not.toContain("CANARY");
  });
});
