// @vitest-environment node
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CourseFixture, createCourseFixture, VISIBLE_MARKER } from "@/test/course-fixture";
import { learnerFiles } from "./files";
import { type CourseFs, nodeCourseFs } from "./node-fs";
import { readCourse } from "./read";
import { readLessonText } from "./text";
import { findLesson, toCatalogView, toDashboardView, toLessonView } from "./view";

// Layer 1 of the leak defence (design 7): grader material in the fixture carries "CANARY-"; nothing built
// for a page may hold it, and the loader may request no file outside the learner listing.

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  fixture.remove();
});

function recordingFs(): { fs: CourseFs; requested: string[]; listed: string[] } {
  const requested: string[] = [];
  const listed: string[] = [];
  const fs: CourseFs = {
    // Recorded before delegating, so a refused request is caught too.
    readText(root, rel) {
      requested.push(rel);
      return nodeCourseFs.readText(root, rel);
    },
    isRegularFile(root, rel) {
      requested.push(rel);
      return nodeCourseFs.isRegularFile(root, rel);
    },
    listDirs(root, rel) {
      listed.push(rel);
      return nodeCourseFs.listDirs(root, rel);
    },
  };
  return { fs, requested, listed };
}

describe("course views and texts", () => {
  it("carry no grader material and request only learner files", async () => {
    const { fs, requested, listed } = recordingFs();

    const tree = await readCourse(fs, fixture.root);
    const views: unknown[] = [toCatalogView(tree), toDashboardView(tree)];
    const texts: string[] = [];
    for (const module of tree.modules) {
      for (const node of module.lessons) {
        const found = findLesson(tree, node.lesson.id);
        if (found === undefined) continue;
        views.push(toLessonView(tree, found));
        texts.push(await readLessonText(fs, fixture.root, found.node.dir, "theory"));
        texts.push(await readLessonText(fs, fixture.root, found.node.dir, "task"));
      }
    }
    const rendered = inspect(views, { depth: Infinity }) + texts.join("\n");

    expect(rendered).not.toContain("CANARY-");
    expect(rendered).toContain(VISIBLE_MARKER);
    expect(requested.filter((rel) => !learnerFiles(tree).includes(rel))).toEqual([]);
    expect(listed).toEqual([""]);
  });
});
