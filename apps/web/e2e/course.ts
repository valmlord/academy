import path from "node:path";
import { readEveryCourse } from "../lib/course/courses";
import { describeCourseFailure } from "../lib/course/errors";
import { nodeCourseFs } from "../lib/course/node-fs";
import type { CourseTree } from "../lib/course/read";
import { readLessonText } from "../lib/course/text";
import {
  type CatalogView,
  type DashboardView,
  findLesson,
  type LessonView,
  toCatalogView,
  toDashboardView,
  toLessonView,
} from "../lib/course/view";

// Expectations come from the repository's own course/, read by the same loader and views as the app,
// so no count or title is written into a spec. Deliberately not COURSE_ROOT: the image under test was
// built from this course/, whatever a shell variable says.
export const REPO_COURSE_ROOT = path.join(import.meta.dirname, "../../../course");
// The several-course specs read the committed fixture root the same way, for a stack whose web serves an
// export of it (compose.fixture-course-root.yaml).
export const FIXTURE_COURSE_ROOT = path.join(
  import.meta.dirname,
  "../../../tests/fixtures/course-root",
);

/** A course root of the repository, or one of its courses, does not read. */
export class RepoCourseReadError extends Error {
  constructor(root: string, detail: string) {
    super(`the repository's course root ${root} does not read: ${detail}`);
    this.name = "RepoCourseReadError";
  }
}

/** A course root of the repository reads in full but lacks the course a spec asked for. */
export class RepoCourseMissingError extends Error {
  constructor(root: string, wanted: string) {
    super(`the repository's course root ${root} reads, but holds no ${wanted}`);
    this.name = "RepoCourseMissingError";
  }
}

/** Every course of `root`, in list order; `label` names the root in the error. */
async function readCourses(root: string, label: string): Promise<CourseTree[]> {
  const every = await readEveryCourse({ fs: nodeCourseFs, root: () => root });
  if (every.kind === "root-failure") {
    throw new RepoCourseReadError(label, describeCourseFailure(every.error));
  }
  const read: CourseTree[] = [];
  for (const course of every.courses) {
    if (course.kind === "course-failure") {
      throw new RepoCourseReadError(label, describeCourseFailure(course.error));
    }
    read.push(course.tree);
  }
  return read;
}

let trees: Promise<CourseTree[]> | undefined;
let fixtureTrees: Promise<CourseTree[]> | undefined;

/** Every course of the repository, in list order. */
export function repoCourses(): Promise<CourseTree[]> {
  trees ??= readCourses(REPO_COURSE_ROOT, "course/");
  return trees;
}

/** Every course of tests/fixtures/course-root, in list order. */
export function fixtureCourses(): Promise<CourseTree[]> {
  fixtureTrees ??= readCourses(FIXTURE_COURSE_ROOT, "tests/fixtures/course-root");
  return fixtureTrees;
}

/** The course `id` of tests/fixtures/course-root. */
export async function fixtureCourse(id: string): Promise<CourseTree> {
  const found = (await fixtureCourses()).find((tree) => tree.id === id);
  if (found === undefined) {
    throw new RepoCourseMissingError("tests/fixtures/course-root", `course ${id}`);
  }
  return found;
}

/** The first course of course/; the one-course dashboard shows it until #247. */
export async function repoCourse(): Promise<CourseTree> {
  const [first] = await repoCourses();
  if (first === undefined) throw new RepoCourseMissingError("course/", "course at all");
  return first;
}

export async function repoCatalog(): Promise<CatalogView> {
  return toCatalogView(await repoCourse());
}

export async function repoDashboard(): Promise<DashboardView> {
  return toDashboardView(await repoCourse());
}

export interface RepoLesson {
  view: LessonView;
  theory: string;
  task: string;
}

/** Every visible lesson in course order, with its view and both Markdown texts. */
export async function repoLessons(): Promise<RepoLesson[]> {
  const course = await repoCourse();
  const catalog = toCatalogView(course);
  const lessons: RepoLesson[] = [];
  for (const lesson of catalog.modules.flatMap((module) => module.lessons)) {
    const found = findLesson(course, lesson.id);
    if (found === undefined) throw new Error(`catalog lesson ${lesson.id} is not visible`);
    lessons.push({
      view: toLessonView(course, found),
      theory: await readLessonText(nodeCourseFs, REPO_COURSE_ROOT, found.node.dir, "theory"),
      task: await readLessonText(nodeCourseFs, REPO_COURSE_ROOT, found.node.dir, "task"),
    });
  }
  return lessons;
}
