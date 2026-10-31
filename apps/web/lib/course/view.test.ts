// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CourseFixture, createCourseFixture, FIXTURE_COURSE_ID } from "@/test/course-fixture";
import { nodeCourseFs } from "./node-fs";
import { type CourseTree, readCourse } from "./read";
import { findLesson, toCatalogView, toDashboardView, toLessonView } from "./view";

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  fixture.remove();
});

const read = (): Promise<CourseTree> => readCourse(nodeCourseFs, fixture.root);

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
      "course/00-basics/module.yaml",
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
  it("names the first visible lesson as next and counts visible lessons", async () => {
    const view = toDashboardView(await read());

    expect(view.courseId).toBe(FIXTURE_COURSE_ID);
    expect(view.next).toEqual({
      id: "first-lesson",
      title: "First lesson",
      type: "theory",
      estimatedMinutes: 10,
      moduleTitle: "Basics",
    });
    expect(view.totalLessons).toBe(2);
    expect(view.modules.map((m) => [m.id, m.isAvailable, m.lessonCount])).toEqual([
      ["basics", true, 2],
      ["later", false, 0],
    ]);
  });

  it("has no next lesson when nothing is visible", async () => {
    fixture.write(
      "course/00-basics/module.yaml",
      "id: basics\ntitle: Basics\nsummary: S.\nstatus: planned\nlessons:\n  - 01-first\n",
    );

    const view = toDashboardView(await read());

    expect(view.next).toBeNull();
    expect(view.totalLessons).toBe(0);
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
      "course/00-basics/01-first/lesson.yaml",
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
  });
});
