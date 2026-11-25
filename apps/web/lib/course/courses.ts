import { Course } from "@academy/lesson-schema/schema";
import {
  COURSE_ROOT_FILE,
  CourseFileError,
  CourseReadError,
  CourseRootReadError,
  DIRECTORY_NAME_IS_NOT_A_COURSE_ID,
  ID_IS_NOT_THE_DIRECTORY_NAME,
  NO_COURSE,
} from "./errors";
import type { CourseFs } from "./node-fs";
import { COURSE_FILE, type CourseTree, parseFile, readModules } from "./read";

// The per-course read of ADR-0009 item 8 as amended by #219: a course id from a request reaches a course only
// through readCourseById, which checks its form, looks it up among the names the root lists and builds every
// path from the listed name. Each course state is a returned value, so every caller branches on the same four
// outcomes; nothing here logs, the caller decides (lib/course/reads.ts).

export interface CourseSource {
  fs: CourseFs;
  /** Throws `CourseRootReadError` when the root cannot be resolved (a relative `COURSE_ROOT`). */
  root: () => string;
}

export type CourseRead =
  | { kind: "course"; tree: CourseTree }
  | { kind: "course-failure"; error: CourseReadError }
  | { kind: "root-failure"; error: CourseRootReadError };

export type CourseLookup = CourseRead | { kind: "not-found" };

export type CourseList =
  | { kind: "names"; names: string[] }
  | { kind: "root-failure"; error: CourseRootReadError };

/** One listed course as read: a tree or that course's failure. */
export type ListedCourseRead = Exclude<CourseRead, { kind: "root-failure" }>;

export type EveryCourse =
  | { kind: "courses"; courses: ListedCourseRead[] }
  | { kind: "root-failure"; error: CourseRootReadError };

export interface OtherCourse {
  id: string;
  /** The title of the course's own `course.yaml`; `undefined` when that file fails `readCourseFile`. */
  title: string | undefined;
}

export type OtherCourseList =
  | { kind: "courses"; courses: OtherCourse[] }
  | { kind: "root-failure"; error: CourseRootReadError };

type RootListing =
  | { kind: "listed"; root: string; names: string[] }
  | { kind: "root-failure"; error: CourseRootReadError };

const NOT_FOUND: CourseLookup = { kind: "not-found" };

/** Whether `value` has the lesson schema's course id form; anything else names no course. */
export function isCourseIdForm(value: unknown): value is string {
  return Course.shape.id.safeParse(value).success;
}

function rootFailure(
  file: string,
  reason: string,
): { kind: "root-failure"; error: CourseRootReadError } {
  return { kind: "root-failure", error: new CourseRootReadError(file, reason) };
}

type CourseFailure = { kind: "course-failure"; error: CourseReadError };

function courseFailure(courseId: string, file: string, reason: string): CourseFailure {
  return { kind: "course-failure", error: new CourseReadError(courseId, file, reason) };
}

async function listRoot(source: CourseSource): Promise<RootListing> {
  let root: string;
  try {
    root = source.root();
  } catch (error) {
    if (error instanceof CourseRootReadError) return { kind: "root-failure", error };
    throw error;
  }
  let names: string[];
  try {
    // Real directories only, in plain-string order (item 6): a file or a symlink at the root is no course.
    names = await source.fs.listDirs(root, "");
  } catch (error) {
    if (error instanceof CourseFileError) return rootFailure(error.file, error.reason);
    throw error;
  }
  if (names.length === 0) return rootFailure(COURSE_ROOT_FILE, NO_COURSE);
  return { kind: "listed", root, names };
}

// `name` must be an element of the root's listing, never a caller's id: that is what keeps every path built
// from a listed name. A type cannot say so without an assertion, so these functions stay private to this module.

/** The listed course's own `course.yaml`, parsed, when the name is in the course id form and the id matches it. */
async function readCourseFile(
  fs: CourseFs,
  root: string,
  name: string,
): Promise<{ kind: "course-file"; course: Course } | CourseFailure> {
  if (!isCourseIdForm(name)) {
    return courseFailure(name, COURSE_ROOT_FILE, DIRECTORY_NAME_IS_NOT_A_COURSE_ID);
  }
  const file = `${name}/${COURSE_FILE}`;
  try {
    const course = await parseFile(fs, root, file, Course);
    if (course.id !== name) return courseFailure(name, file, ID_IS_NOT_THE_DIRECTORY_NAME);
    return { kind: "course-file", course };
  } catch (error) {
    if (error instanceof CourseFileError) return courseFailure(name, error.file, error.reason);
    throw error;
  }
}

async function readListedCourse(
  fs: CourseFs,
  root: string,
  name: string,
): Promise<ListedCourseRead> {
  // Before any module.yaml is opened, so a course claiming another course's id reads no more of itself.
  const read = await readCourseFile(fs, root, name);
  if (read.kind === "course-failure") return read;
  const { course } = read;
  try {
    const modules = await readModules(fs, root, name, course);
    return {
      kind: "course",
      tree: { id: name, title: course.title, description: course.description, dir: name, modules },
    };
  } catch (error) {
    if (error instanceof CourseFileError) return courseFailure(name, error.file, error.reason);
    throw error;
  }
}

/** The names of the root's courses, or the root's failure. */
export async function listCourseNames(source: CourseSource): Promise<CourseList> {
  const listing = await listRoot(source);
  if (listing.kind === "root-failure") return listing;
  return { kind: "names", names: listing.names };
}

/**
 * The course a request's id names. An id not in the course id form opens nothing, not even the listing; an
 * id the root does not list is `not-found` after that one listing.
 */
export async function readCourseById(
  source: CourseSource,
  courseId: unknown,
): Promise<CourseLookup> {
  if (!isCourseIdForm(courseId)) return NOT_FOUND;
  const listing = await listRoot(source);
  if (listing.kind === "root-failure") return listing;
  const name = listing.names.find((listed) => listed === courseId);
  if (name === undefined) return NOT_FOUND;
  return readListedCourse(source.fs, listing.root, name);
}

/** Every course of the root in list order, one listing, each failure kept beside the others. */
export async function readEveryCourse(source: CourseSource): Promise<EveryCourse> {
  const listing = await listRoot(source);
  if (listing.kind === "root-failure") return listing;
  const courses: ListedCourseRead[] = [];
  for (const name of listing.names) {
    courses.push(await readListedCourse(source.fs, listing.root, name));
  }
  return { kind: "courses", courses };
}

/**
 * The listed courses other than `courseId`, in list order, each with the title of its `course.yaml` when
 * `readCourseFile` accepts that file. One listing; a name not in the course id form is left out, and for every
 * other name `readCourseFile` opens that course's `course.yaml` alone, so no module of another course is read.
 * `courseId` is only compared with listed names.
 */
export async function readOtherCourses(
  source: CourseSource,
  courseId: string,
): Promise<OtherCourseList> {
  const listing = await listRoot(source);
  if (listing.kind === "root-failure") return listing;
  const courses: OtherCourse[] = [];
  for (const name of listing.names) {
    if (name === courseId || !isCourseIdForm(name)) continue;
    const read = await readCourseFile(source.fs, listing.root, name);
    courses.push({ id: name, title: read.kind === "course-file" ? read.course.title : undefined });
  }
  return { kind: "courses", courses };
}

/**
 * The first listed course that reads, else the first failure in list order. A seam for the one-course
 * dashboard until #247 (ADR-0009 item 8 binds it there). `courseById` is the request's cached read, so no
 * course is read twice in a request.
 *
 * The failure of a non-slug name and the `.: no course` result are built here, not by `courseById`, so neither
 * logs a per-request line.
 */
export async function firstReadableCourse(
  list: () => Promise<CourseList>,
  courseById: (courseId: string) => Promise<CourseLookup>,
): Promise<CourseRead> {
  const listing = await list();
  if (listing.kind === "root-failure") return listing;
  let firstFailure: { kind: "course-failure"; error: CourseReadError } | undefined;
  for (const name of listing.names) {
    if (!isCourseIdForm(name)) {
      // courseById would answer not-found for it; it is the same failing course readEveryCourse reports.
      firstFailure ??= courseFailure(name, COURSE_ROOT_FILE, DIRECTORY_NAME_IS_NOT_A_COURSE_ID);
      continue;
    }
    const lookup = await courseById(name);
    // A root that changed after the listing (pnpm dev only) fails every later lookup alike.
    if (lookup.kind === "course" || lookup.kind === "root-failure") return lookup;
    // not-found: the directory went away after the listing (pnpm dev only), so it is no course any more.
    if (lookup.kind === "course-failure") firstFailure ??= lookup;
  }
  return firstFailure ?? rootFailure(COURSE_ROOT_FILE, NO_COURSE);
}
