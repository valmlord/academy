// @vitest-environment node
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
  fixtureSource,
} from "@/test/course-fixture";
import type { CourseSource } from "./courses";
import { nodeCourseFs } from "./node-fs";
import { type CourseReads, createCourseReads } from "./reads";
import { courseRoot } from "./root";

// The web's per-request operator lines as whole lines, through the factory the server wiring uses.

let fixture: CourseFixture;
const scratch: string[] = [];
const lockedDirs: string[] = [];

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  for (const dir of lockedDirs.splice(0)) chmodSync(dir, 0o755);
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  fixture.remove();
});

function emptyRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "course-reads-"));
  scratch.push(root);
  return root;
}

function readsOver(source: CourseSource): {
  reads: CourseReads;
  lines: string[];
} {
  const lines: string[] = [];
  return { reads: createCourseReads({ source, logError: (line) => lines.push(line) }), lines };
}

describe("createCourseReads", () => {
  it("logs the course line for a failing course", async () => {
    const { reads, lines } = readsOver(fixtureSource(fixture.root));

    await reads.courseById(BROKEN_COURSE_ID);

    expect(lines).toEqual([
      "web: course read failed: course broken-course: broken-course/course.yaml: id is not the directory name",
    ]);
  });

  it.each([
    ["an empty root", () => emptyRoot(), "root: .: no course"],
    ["a missing root", () => path.join(emptyRoot(), "absent"), "root: .: missing"],
    [
      "a relative COURSE_ROOT",
      () => courseRoot({ COURSE_ROOT: "course" }, "/repo/apps/web"),
      "root: COURSE_ROOT: must be an absolute path",
    ],
    [
      "a root it may not list",
      () => {
        // Root lists a mode-000 directory, so the case would prove nothing: fail rather than skip.
        expect(process.getuid?.()).not.toBe(0);
        const root = emptyRoot();
        chmodSync(root, 0o000);
        lockedDirs.push(root);
        return root;
      },
      "root: .: unreadable (EACCES)",
    ],
  ])("logs the root line for %s from both reads", async (_label, root, failure) => {
    const { reads, lines } = readsOver({ fs: nodeCourseFs, root });

    await reads.courseById(FIXTURE_COURSE_ID);
    await reads.listNames();

    expect(lines).toEqual([
      `web: course read failed: ${failure}`,
      `web: course read failed: ${failure}`,
    ]);
  });

  it("logs the root line for the other courses of a missing root", async () => {
    const { reads, lines } = readsOver({
      fs: nodeCourseFs,
      root: () => path.join(emptyRoot(), "absent"),
    });

    await reads.otherCourses(FIXTURE_COURSE_ID);

    expect(lines).toEqual(["web: course read failed: root: .: missing"]);
  });

  it("logs nothing for a failing other course", async () => {
    const { reads, lines } = readsOver(fixtureSource(fixture.root));

    const others = await reads.otherCourses(FIXTURE_COURSE_ID);

    expect(others).toEqual({
      kind: "courses",
      courses: [{ id: BROKEN_COURSE_ID, title: undefined }],
    });
    expect(lines).toEqual([]);
  });

  it.each(["A B", "..", "no-such-course", FIXTURE_COURSE_ID])(
    "logs nothing for %s, which names no failing course",
    async (courseId) => {
      const { reads, lines } = readsOver(fixtureSource(fixture.root));

      await reads.courseById(courseId);
      await reads.listNames();

      expect(lines).toEqual([]);
    },
  );
});
