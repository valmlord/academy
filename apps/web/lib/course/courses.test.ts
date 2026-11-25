// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BROKEN_COURSE_ID,
  type CourseFixture,
  createCourseFixture,
  FIXTURE_COURSE_ID,
  fixtureSource,
  recordingCourseFs,
} from "@/test/course-fixture";
import {
  type CourseLookup,
  type ListedCourseRead,
  readCourseById,
  readEveryCourse,
  readOtherCourses,
} from "./courses";
import { CourseReadError, describeCourseFailure } from "./errors";
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

  it.each<[string, () => void, string, string | undefined]>([
    [
      "a directory name outside the id form",
      () => mkdirSync(fixture.path("Zed")),
      "Zed",
      undefined,
    ],
    [
      "a directory without course.yaml",
      () => mkdirSync(fixture.path("plain-course")),
      "plain-course",
      undefined,
    ],
    ["a course.yaml whose id is not the directory name", () => {}, BROKEN_COURSE_ID, undefined],
    [
      "a module file that fails after course.yaml read",
      () => fixture.write(`${FIXTURE_COURSE_ID}/00-basics/module.yaml`, "id: [unclosed\n"),
      FIXTURE_COURSE_ID,
      "Fixture course",
    ],
  ])(
    "keeps the course.yaml title only for a failure after course.yaml read: %s",
    async (_label, arrange, courseId, title) => {
      arrange();

      const every = await readEveryCourse(fixtureSource(fixture.root));

      const failure =
        every.kind === "courses"
          ? every.courses.find(
              (read) => read.kind === "course-failure" && read.error.courseId === courseId,
            )
          : undefined;
      expect(failure?.kind === "course-failure" && failure.error).toMatchObject({
        courseId,
        title,
      });
    },
  );

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

/** The listed name a read stands for: the tree's id, or the failing course's id. */
function listedId(read: ListedCourseRead): string {
  return read.kind === "course" ? read.tree.id : read.error.courseId;
}

describe("readEveryCourse", () => {
  it("lists real directories only, in plain-string order", async () => {
    fixture.write("a-file", "not a course\n");
    symlinkSync(fixture.path(FIXTURE_COURSE_ID), fixture.path("linked-course"));
    mkdirSync(fixture.path("Zed"));

    const every = await readEveryCourse(fixtureSource(fixture.root));

    expect(every.kind === "courses" && every.courses.map(listedId)).toEqual([
      "Zed",
      BROKEN_COURSE_ID,
      FIXTURE_COURSE_ID,
    ]);
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
    const every = await readEveryCourse({ fs: nodeCourseFs, root });

    expect(every.kind === "root-failure" && describeCourseFailure(every.error)).toBe(line);
  });

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

describe("readOtherCourses", () => {
  it("names the other courses in list order by their course.yaml alone, a failing one by its id", async () => {
    // A course.yaml whose one module does not exist: a read of its modules would fail this course.
    fixture.write(
      "aaa-course/course.yaml",
      "id: aaa-course\ntitle: Aaa course\ndescription: A course with no module directory.\nmodules:\n  - 00-missing\n",
    );
    const { fs, calls } = recordingCourseFs();

    const others = await readOtherCourses(fixtureSource(fixture.root, fs), FIXTURE_COURSE_ID);

    expect(others).toEqual({
      kind: "courses",
      courses: [
        { id: "aaa-course", title: "Aaa course" },
        { id: BROKEN_COURSE_ID, title: undefined },
      ],
    });
    expect(calls).toEqual([
      LISTING,
      'readText "aaa-course/course.yaml"',
      'readText "broken-course/course.yaml"',
    ]);
  });
});
