// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CourseFixture, createCourseFixture, readFixtureTree } from "@/test/course-fixture";
import { learnerFiles } from "./files";

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  fixture.remove();
});

describe("learnerFiles", () => {
  it("lists exactly the structure files and the listed lessons' three files", async () => {
    const tree = await readFixtureTree(fixture.root);

    const files = learnerFiles(tree);

    expect(files.toSorted()).toEqual([
      "fixture-course/00-basics/01-first/lesson.yaml",
      "fixture-course/00-basics/01-first/task.md",
      "fixture-course/00-basics/01-first/theory.md",
      "fixture-course/00-basics/02-second/lesson.yaml",
      "fixture-course/00-basics/02-second/task.md",
      "fixture-course/00-basics/02-second/theory.md",
      "fixture-course/00-basics/03-draft/lesson.yaml",
      "fixture-course/00-basics/03-draft/task.md",
      "fixture-course/00-basics/03-draft/theory.md",
      "fixture-course/00-basics/module.yaml",
      "fixture-course/01-later/01-hidden/lesson.yaml",
      "fixture-course/01-later/01-hidden/task.md",
      "fixture-course/01-later/01-hidden/theory.md",
      "fixture-course/01-later/module.yaml",
      "fixture-course/course.yaml",
    ]);
  });
});
