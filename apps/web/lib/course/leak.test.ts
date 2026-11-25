// @vitest-environment node
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
  fixtureSource,
  makeBrokenCourseReadable,
  recordingCourseFs,
  VISIBLE_MARKER,
} from "@/test/course-fixture";
import { readEveryCourse, readOtherCourses } from "./courses";
import { learnerFiles } from "./files";
import type { CourseFs } from "./node-fs";
import type { CourseTree } from "./read";
import { readLessonText } from "./text";
import { findLesson, toCatalogView, toDashboardPage, toDashboardView, toLessonView } from "./view";

// Layer 1 of the leak defence (design 7): grader material in the fixture carries "CANARY-"; nothing built
// for a page may hold it, and the loader may request no file outside the learner listing. The root holds two
// courses, one failing, so the defence is checked per course (ADR-0009 item 10).

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  fixture.remove();
});

interface Scan {
  rendered: string;
  trees: CourseTree[];
  failingCourseIds: string[];
}

async function scanEveryCourse(fs: CourseFs): Promise<Scan> {
  const every = await readEveryCourse(fixtureSource(fixture.root, fs));
  if (every.kind === "root-failure") throw every.error;
  const trees: CourseTree[] = [];
  const failingCourseIds: string[] = [];
  const views: unknown[] = [];
  const texts: string[] = [];
  for (const course of every.courses) {
    if (course.kind === "course-failure") {
      failingCourseIds.push(course.error.courseId);
      views.push(course.error);
      continue;
    }
    const { tree } = course;
    trees.push(tree);
    views.push(toCatalogView(tree), toDashboardView(tree));
    for (const module of tree.modules) {
      for (const node of module.lessons) {
        const found = findLesson(tree, node.lesson.id);
        if (found === undefined) continue;
        views.push(toLessonView(tree, found));
        texts.push(await readLessonText(fs, fixture.root, found.node.dir, "theory"));
        texts.push(await readLessonText(fs, fixture.root, found.node.dir, "task"));
      }
    }
  }
  views.push(toDashboardPage(trees));
  return {
    rendered: inspect(views, { depth: Infinity }) + texts.join("\n"),
    trees,
    failingCourseIds,
  };
}

describe("course views and texts", () => {
  it("carry no grader material and request only learner files, beside a failing course", async () => {
    const { fs, calls } = recordingCourseFs();

    const { rendered, trees, failingCourseIds } = await scanEveryCourse(fs);

    const allowed = [
      ...trees.flatMap((tree) => learnerFiles(tree)),
      ...failingCourseIds.map((courseId) => `${courseId}/course.yaml`),
    ].map((rel) => `readText ${JSON.stringify(rel)}`);
    expect(failingCourseIds).toEqual([BROKEN_COURSE_ID]);
    expect(rendered).not.toContain("CANARY-");
    expect(rendered).toContain(VISIBLE_MARKER);
    expect(calls.filter((call) => !allowed.includes(call))).toEqual(['listDirs ""']);
  });

  it("carry no grader material of either course once both read", async () => {
    makeBrokenCourseReadable(fixture);
    const { fs, calls } = recordingCourseFs();

    const { rendered, trees } = await scanEveryCourse(fs);

    const allowed = trees
      .flatMap((tree) => learnerFiles(tree))
      .map((rel) => `readText ${JSON.stringify(rel)}`);
    expect(trees.map((tree) => tree.id)).toEqual([BROKEN_COURSE_ID, "fixture-course"]);
    expect(rendered).not.toContain("CANARY-");
    expect(rendered).toContain(VISIBLE_MARKER);
    expect(calls.filter((call) => !allowed.includes(call))).toEqual(['listDirs ""']);
  });
});

describe("the other-course read", () => {
  it("requests only each other course's course.yaml, once both read", async () => {
    makeBrokenCourseReadable(fixture);
    const { fs, calls } = recordingCourseFs();
    const source = fixtureSource(fixture.root, fs);

    const others = [
      await readOtherCourses(source, FIXTURE_COURSE_ID),
      await readOtherCourses(source, BROKEN_COURSE_ID),
    ];

    expect(others.map((list) => list.kind)).toEqual(["courses", "courses"]);
    expect(calls).toEqual([
      'listDirs ""',
      'readText "broken-course/course.yaml"',
      'listDirs ""',
      'readText "fixture-course/course.yaml"',
    ]);
  });
});
