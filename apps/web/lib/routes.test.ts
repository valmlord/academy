// @vitest-environment node
import { describe, expect, it } from "vitest";
import { lessonPathCourseId } from "./routes";

describe("lessonPathCourseId", () => {
  it.each([
    ["/courses/fixture-course/lessons/first-lesson", "fixture-course"],
    // Raw, as Next passes route params: the per-course read rejects the encoded form.
    ["/courses/..%2Fcourse-b/lessons/x", "..%2Fcourse-b"],
  ])("takes the course segment of %s", (pathname, courseId) => {
    expect(lessonPathCourseId(pathname)).toBe(courseId);
  });

  it.each([
    "/courses/fixture-course",
    "/courses/a/lessons",
    "/courses/a/lessons/",
    "/courses/a/lessons/b/c",
    "/no/such/path",
    null,
  ])("takes nothing from %s", (pathname) => {
    expect(lessonPathCourseId(pathname)).toBeUndefined();
  });
});
