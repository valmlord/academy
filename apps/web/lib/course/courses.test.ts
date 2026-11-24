// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
  fixtureSource,
  recordingCourseFs,
} from "@/test/course-fixture";
import {
  type CourseList,
  type CourseLookup,
  firstReadableCourse,
  listCourseNames,
  readCourseById,
  readEveryCourse,
} from "./courses";
import { CourseReadError, CourseRootReadError, describeCourseFailure } from "./errors";
import { nodeCourseFs } from "./node-fs";
import { courseRoot } from "./root";

let fixture: CourseFixture;
const emptyRoots: string[] = [];

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  fixture.remove();
  for (const root of emptyRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const LISTING = 'listDirs ""';

function emptyRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "course-root-empty-"));
  emptyRoots.push(root);
  return root;
}

/** What a lookup reports, in the operator line's form, so a whole outcome is one comparable value. */
function outcome(lookup: CourseLookup): string {
  if (lookup.kind === "course") return `course ${lookup.tree.id}`;
  if (lookup.kind === "not-found") return "not-found";
  return `${lookup.kind} ${describeCourseFailure(lookup.error)}`;
}

describe("listCourseNames", () => {
  it("lists real directories only, in plain-string order", async () => {
    fixture.write("a-file", "not a course\n");
    symlinkSync(fixture.path(FIXTURE_COURSE_ID), fixture.path("linked-course"));
    mkdirSync(fixture.path("Zed"));

    const list = await listCourseNames(fixtureSource(fixture.root));

    expect(list).toEqual({ kind: "names", names: ["Zed", BROKEN_COURSE_ID, FIXTURE_COURSE_ID] });
  });

  it.each([
    ["an empty root", () => emptyRoot(), "root: .: no course"],
    ["a missing root", () => path.join(emptyRoot(), "absent"), "root: .: missing"],
    [
      "a relative COURSE_ROOT",
      () => courseRoot({ COURSE_ROOT: "course" }, "/repo/apps/web"),
      "root: COURSE_ROOT: must be an absolute path",
    ],
  ])("reports %s as a root failure", async (_label, root, line) => {
    const source = { fs: nodeCourseFs, root };

    const list = await listCourseNames(source);
    const every = await readEveryCourse(source);

    expect(list.kind === "root-failure" && describeCourseFailure(list.error)).toBe(line);
    expect(every.kind === "root-failure" && describeCourseFailure(every.error)).toBe(line);
  });
});

describe("readCourseById", () => {
  it.each<[unknown]>([["A B"], [".."], ["../course-b"], [42]])(
    "answers not-found for %o without any file call",
    async (courseId) => {
      const { fs, calls } = recordingCourseFs();

      const lookup = await readCourseById(fixtureSource(fixture.root, fs), courseId);

      expect(lookup).toEqual({ kind: "not-found" });
      expect(calls).toEqual([]);
    },
  );

  it("answers not-found for an unlisted id after the listing alone", async () => {
    const { fs, calls } = recordingCourseFs();

    const lookup = await readCourseById(fixtureSource(fixture.root, fs), "no-such-course");

    expect(lookup).toEqual({ kind: "not-found" });
    expect(calls).toEqual([LISTING]);
  });

  it("fails a course whose id is not its directory name, and reads the other course", async () => {
    const source = fixtureSource(fixture.root);

    const broken = await readCourseById(source, BROKEN_COURSE_ID);
    const readable = await readCourseById(source, FIXTURE_COURSE_ID);

    expect(broken).toEqual({ kind: "course-failure", error: expect.any(CourseReadError) });
    expect(broken.kind === "course-failure" && broken.error).toMatchObject({
      courseId: BROKEN_COURSE_ID,
      file: "broken-course/course.yaml",
      reason: "id is not the directory name",
    });
    expect(outcome(readable)).toBe(`course ${FIXTURE_COURSE_ID}`);
  });

  it("opens only course.yaml of a course whose id is not its directory name", async () => {
    const { fs, calls } = recordingCourseFs();

    await readCourseById(fixtureSource(fixture.root, fs), BROKEN_COURSE_ID);

    expect(calls).toEqual([LISTING, 'readText "broken-course/course.yaml"']);
  });

  it("fails a directory without course.yaml as that course, alone and in the full read", async () => {
    mkdirSync(fixture.path("plain-course"));
    const source = fixtureSource(fixture.root);
    const line = "course-failure course plain-course: plain-course/course.yaml: missing";

    const lookup = await readCourseById(source, "plain-course");
    const every = await readEveryCourse(source);

    expect(outcome(lookup)).toBe(line);
    expect(every.kind === "courses" && every.courses.map(outcome)).toContain(line);
  });
});

describe("readEveryCourse", () => {
  it("reads every listed course in order, a failing one beside the readable one", async () => {
    const { fs, calls } = recordingCourseFs();

    const every = await readEveryCourse(fixtureSource(fixture.root, fs));

    expect(every.kind === "courses" && every.courses.map(outcome)).toEqual([
      "course-failure course broken-course: broken-course/course.yaml: id is not the directory name",
      `course ${FIXTURE_COURSE_ID}`,
    ]);
    expect(calls.filter((call) => call === LISTING)).toEqual([LISTING]);
  });
});

describe("firstReadableCourse", () => {
  function overFixture(): Parameters<typeof firstReadableCourse> {
    const source = fixtureSource(fixture.root);
    return [() => listCourseNames(source), (courseId) => readCourseById(source, courseId)];
  }

  function names(...listed: string[]): () => Promise<CourseList> {
    return async () => ({ kind: "names", names: listed });
  }

  it("passes over a failing course to the first that reads", async () => {
    const first = await firstReadableCourse(...overFixture());

    expect(outcome(first)).toBe(`course ${FIXTURE_COURSE_ID}`);
  });

  it("returns the first failure in list order when no course reads", async () => {
    rmSync(fixture.path("fixture-course/00-basics/module.yaml"));

    const first = await firstReadableCourse(...overFixture());

    expect(outcome(first)).toBe(
      "course-failure course broken-course: broken-course/course.yaml: id is not the directory name",
    );
  });

  it("returns the listing's root failure", async () => {
    const source = { fs: nodeCourseFs, root: () => path.join(emptyRoot(), "absent") };
    const courseById = vi.fn((courseId: string) => readCourseById(source, courseId));

    const first = await firstReadableCourse(() => listCourseNames(source), courseById);

    expect(outcome(first)).toBe("root-failure root: .: missing");
    expect(courseById).not.toHaveBeenCalled();
  });

  it("fails the first non-slug name itself, never asking courseById", async () => {
    const courseById = vi.fn(async (): Promise<CourseLookup> => ({ kind: "not-found" }));

    const first = await firstReadableCourse(names("A B", "B C"), courseById);

    expect(outcome(first)).toBe(
      'course-failure course "A B": .: directory name is not a course id',
    );
    expect(courseById).not.toHaveBeenCalled();
  });

  it("answers no course when courseById finds none of the listed slugs", async () => {
    const first = await firstReadableCourse(names("gone-a", "gone-b"), async () => ({
      kind: "not-found",
    }));

    expect(outcome(first)).toBe("root-failure root: .: no course");
  });

  it("stops at a root failure courseById returns", async () => {
    const courseById = vi.fn(
      async (): Promise<CourseLookup> => ({
        kind: "root-failure",
        error: new CourseRootReadError(".", "missing"),
      }),
    );

    const first = await firstReadableCourse(names("gone-a", "gone-b"), courseById);

    expect(outcome(first)).toBe("root-failure root: .: missing");
    expect(courseById).toHaveBeenCalledTimes(1);
  });
});
