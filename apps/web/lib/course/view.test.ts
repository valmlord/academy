// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
  makeBrokenCourseReadable,
  readFixtureTree,
  THEORY_COURSE_TITLE,
  writeTheoryOnlyCourse,
} from "@/test/course-fixture";
import type { CourseTree } from "./read";
import {
  type DashboardView,
  findLesson,
  toCatalogView,
  toDashboardPage,
  toDashboardView,
  toLessonView,
} from "./view";

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  fixture.remove();
});

const read = (): Promise<CourseTree> => readFixtureTree(fixture.root);

describe("toCatalogView", () => {
  it("shows only ready lessons of ready modules, and a module without one as not available", async () => {
    const view = toCatalogView(await read());

    expect(view.modules.map((m) => [m.id, m.isAvailable, m.lessons.map((l) => l.id)])).toEqual([
      ["basics", true, ["first-lesson", "second-lesson"]],
      ["later", false, []],
    ]);
  });

  it("keeps a ready module with no ready lesson as not available", async () => {
    fixture.write(
      "fixture-course/00-basics/module.yaml",
      "id: basics\ntitle: Basics\nsummary: S.\nstatus: ready\nlessons:\n  - 03-draft\n",
    );

    const view = toCatalogView(await read());

    expect(view.modules[0]).toMatchObject({ isAvailable: false, lessons: [] });
  });

  it("lists only visible prerequisites, in lesson.yaml order", async () => {
    const view = toCatalogView(await read());

    const second = view.modules[0]?.lessons[1];

    expect(second?.prerequisites).toEqual([{ id: "first-lesson", title: "First lesson" }]);
  });
});

describe("toDashboardView", () => {
  // The invariant page.tsx relies on: no next lesson exactly when no lesson is counted (D12).
  const expectNextIffCounted = (view: DashboardView): void => {
    expect(view.next === null).toBe(view.totalLessons === 0);
  };

  // second-lesson keeps only its quiz check, whose kind has not shipped, so no visible lesson is counted.
  const writeSecondLessonWithQuizOnly = (): void => {
    fixture.write(
      "fixture-course/00-basics/02-second/lesson.yaml",
      `id: second-lesson
title: Second lesson
type: artifact
outcomes:
  - Builds the artifact.
estimatedMinutes: 20
status: ready
sources:
  - { title: Source one, url: "https://example.com/one", checkedAt: "2026-10-01" }
checks:
  - id: quiz-check
    kind: quiz
    title: Quiz check
    file: checks/CANARY-CHECKS-4-file.yaml
    passScore: 0.5
    attempts:
      limit: 3
`,
    );
  };

  it("names the first lesson with a counted check as next and counts only such lessons", async () => {
    const view = toDashboardView(await read());

    expect(view.courseId).toBe(FIXTURE_COURSE_ID);
    expect(view.next).toEqual({
      id: "second-lesson",
      title: "Second lesson",
      type: "artifact",
      estimatedMinutes: 20,
      moduleTitle: "Basics",
    });
    expect(view.totalLessons).toBe(1);
    expect(view.modules.map((m) => [m.id, m.isAvailable, m.lessonCount])).toEqual([
      ["basics", true, 1],
      ["later", false, 0],
    ]);
    expectNextIffCounted(view);
  });

  it("does not count a lesson whose only check is of an unshipped kind", async () => {
    writeSecondLessonWithQuizOnly();

    const view = toDashboardView(await read());

    expect(view.totalLessons).toBe(0);
    expectNextIffCounted(view);
  });

  it("has no next lesson and no course total when no visible lesson has a counted check", async () => {
    writeSecondLessonWithQuizOnly();

    const view = toDashboardView(await read());

    expect(view.next).toBeNull();
    expect(view.totalLessons).toBe(0);
    expect(view.modules.map((m) => [m.id, m.isAvailable, m.lessonCount])).toEqual([
      ["basics", false, 0],
      ["later", false, 0],
    ]);
    expectNextIffCounted(view);
  });

  it("has no next lesson when nothing is visible", async () => {
    fixture.write(
      "fixture-course/00-basics/module.yaml",
      "id: basics\ntitle: Basics\nsummary: S.\nstatus: planned\nlessons:\n  - 01-first\n",
    );

    const view = toDashboardView(await read());

    expect(view.next).toBeNull();
    expect(view.totalLessons).toBe(0);
    expectNextIffCounted(view);
  });
});

describe("toDashboardPage", () => {
  it("takes the Card course as the first course in list order with a next lesson", async () => {
    makeBrokenCourseReadable(fixture);
    writeTheoryOnlyCourse(fixture, "a-theory-course");
    const trees = await Promise.all(
      ["a-theory-course", BROKEN_COURSE_ID, FIXTURE_COURSE_ID].map((id) =>
        readFixtureTree(fixture.root, id),
      ),
    );

    const page = toDashboardPage(trees);

    const brokenLesson = {
      id: "broken-lesson",
      title: "Broken lesson",
      type: "artifact",
      estimatedMinutes: 10,
      moduleTitle: "Only module",
    };
    expect(page.card).toEqual({
      courseId: BROKEN_COURSE_ID,
      courseTitle: "Broken course",
      lesson: brokenLesson,
    });
    expect(page.blocks).toEqual([
      { form: "empty", courseId: "a-theory-course", courseTitle: THEORY_COURSE_TITLE },
      {
        form: "readable",
        courseId: BROKEN_COURSE_ID,
        courseTitle: "Broken course",
        nextLesson: null,
        totalLessons: 1,
        modules: [{ id: "only", title: "Only module", isAvailable: true, lessonCount: 1 }],
      },
      {
        form: "readable",
        courseId: FIXTURE_COURSE_ID,
        courseTitle: "Fixture course",
        nextLesson: {
          id: "second-lesson",
          title: "Second lesson",
          type: "artifact",
          estimatedMinutes: 20,
          moduleTitle: "Basics",
        },
        totalLessons: 1,
        modules: [
          { id: "basics", title: "Basics", isAvailable: true, lessonCount: 1 },
          { id: "later", title: "Later", isAvailable: false, lessonCount: 0 },
        ],
      },
    ]);
  });
});

describe("findLesson and toLessonView", () => {
  it("does not find a ready lesson inside a module that is not ready", async () => {
    const tree = await read();

    expect(findLesson(tree, "hidden-lesson")).toBeUndefined();
    expect(findLesson(tree, "draft-lesson")).toBeUndefined();
  });

  it("keeps only http and https sources", async () => {
    fixture.write(
      "fixture-course/00-basics/01-first/lesson.yaml",
      `id: first-lesson
title: First lesson
type: theory
outcomes: [Reads.]
estimatedMinutes: 10
status: ready
sources:
  - { title: Script, url: "javascript:alert(1)", checkedAt: "2026-10-01" }
  - { title: Web, url: "https://example.com/web", checkedAt: "2026-10-02" }
`,
    );
    const tree = await read();
    const found = findLesson(tree, "first-lesson");
    if (found === undefined) throw new Error("first-lesson not found");

    const view = toLessonView(tree, found);

    expect(view.sources).toEqual([
      { title: "Web", url: "https://example.com/web", checkedAt: "2026-10-02" },
    ]);
    expect(view.module).toEqual({ id: "basics", title: "Basics" });
    expect(view.courseTitle).toBe("Fixture course");
  });
});
