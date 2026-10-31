// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CourseReadError } from "./errors";
import { courseRoot } from "./root";

describe("courseRoot", () => {
  it("returns an absolute COURSE_ROOT unchanged", () => {
    const root = courseRoot({ COURSE_ROOT: "/app/course" }, "/repo/apps/web");

    expect(root).toBe("/app/course");
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("falls back to the repository's course/ when COURSE_ROOT is %s", (_label, value) => {
    const root = courseRoot({ COURSE_ROOT: value }, "/repo/apps/web");

    expect(root).toBe("/repo/course");
  });

  it("refuses a relative COURSE_ROOT naming the variable", () => {
    const act = (): unknown => courseRoot({ COURSE_ROOT: "course" }, "/repo/apps/web");

    expect(act).toThrow(CourseReadError);
    expect(act).toThrow("COURSE_ROOT: must be an absolute path");
  });
});
