// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CourseFixture, createCourseFixture } from "@/test/course-fixture";
import { learnerFiles } from "./files";
import { nodeCourseFs } from "./node-fs";
import { readCourse } from "./read";

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  fixture.remove();
});

describe("learnerFiles", () => {
  it("lists exactly the structure files and the listed lessons' three files", async () => {
    const tree = await readCourse(nodeCourseFs, fixture.root);

    const files = learnerFiles(tree);

    expect(files.toSorted()).toEqual([
      "course/00-basics/01-first/lesson.yaml",
      "course/00-basics/01-first/task.md",
      "course/00-basics/01-first/theory.md",
      "course/00-basics/02-second/lesson.yaml",
      "course/00-basics/02-second/task.md",
      "course/00-basics/02-second/theory.md",
      "course/00-basics/03-draft/lesson.yaml",
      "course/00-basics/03-draft/task.md",
      "course/00-basics/03-draft/theory.md",
      "course/00-basics/module.yaml",
      "course/01-later/01-hidden/lesson.yaml",
      "course/01-later/01-hidden/task.md",
      "course/01-later/01-hidden/theory.md",
      "course/01-later/module.yaml",
      "course/course.yaml",
    ]);
  });
});
