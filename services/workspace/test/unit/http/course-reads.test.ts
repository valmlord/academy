import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCourseById } from "../../../src/course/lessons.js";
import { twoCourseRoot } from "../../support/course-root.js";
import { AUTHORIZED, type TestApp, testApp } from "../../support/http.js";

// PUT W over the real per-course reader on a root of two courses: a start succeeds while another course fails,
// an unlisted course is 404, and the failure lines tell a root failure from a course failure without the user id.

const USER = "user-canary-40f1";

function workspaceUrl(courseId: string): string {
  return `/v1/users/${USER}/courses/${courseId}/lessons/with-workspace/workspace`;
}

let root: string;
let built: TestApp;

beforeEach(async () => {
  root = await twoCourseRoot();
  built = testApp({ readCourse: (courseId) => readCourseById(root, courseId) });
});

afterEach(async () => {
  await built.app.close();
  await rm(root, { recursive: true, force: true });
});

async function put(courseId: string): Promise<{ status: number; body: unknown }> {
  const response = await built.app.inject({
    method: "PUT",
    url: workspaceUrl(courseId),
    headers: AUTHORIZED,
  });
  return { status: response.statusCode, body: response.json() };
}

/** The pino record of the request's failure line, as the sink received it. */
function failureRecord(): { line: string; msg: unknown } {
  const line = built
    .logs()
    .split("\n")
    .find((candidate) => candidate.includes("request failed with"));
  if (line === undefined) throw new Error("no failure line was logged");
  const record: unknown = JSON.parse(line);
  const msg =
    typeof record === "object" && record !== null ? Reflect.get(record, "msg") : undefined;
  return { line, msg };
}

describe("PUT W with several courses", () => {
  it("PUT starts a lesson of a readable course while another course fails", async () => {
    await rm(join(root, "other-course/course.yaml"));

    const { status } = await put("sample-course");

    expect(status).toBe(200);
    expect(built.runtime.calls).toHaveLength(1);
  });

  it("PUT of a slug the root does not list answers 404 lesson-not-found and makes no runtime call", async () => {
    const { status, body } = await put("ghost-course");

    expect([status, body]).toEqual([
      404,
      {
        error: {
          code: "lesson-not-found",
          message: "lesson not found: ghost-course/with-workspace",
        },
      },
    ]);
    expect(built.runtime.calls).toEqual([]);
  });

  it("PUT with a failing root answers 500 course-unreadable and logs the root line without the user id", async () => {
    await rm(root, { recursive: true });

    const { status, body } = await put("sample-course");

    expect([status, body]).toEqual([
      500,
      { error: { code: "course-unreadable", message: "root: .: missing" } },
    ]);
    const record = failureRecord();
    expect(record.msg).toBe("request failed with 500: CourseRootReadError: root: .: missing");
    expect(record.line).not.toContain(USER);
  });

  it("PUT with its own course failing logs the course line without the user id", async () => {
    await rm(join(root, "sample-course/course.yaml"));

    const { status, body } = await put("sample-course");

    const message = "course sample-course: sample-course/course.yaml: missing";
    expect([status, body]).toEqual([500, { error: { code: "course-unreadable", message } }]);
    const record = failureRecord();
    expect(record.msg).toBe(`request failed with 500: CourseReadError: ${message}`);
    expect(record.line).not.toContain(USER);
  });
});
