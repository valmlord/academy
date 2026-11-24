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

/** The repository's course/ does not read; the image built from it would not build either. */
export class RepoCourseReadError extends Error {
  constructor(detail: string) {
    super(`the repository's course root does not read: ${detail}`);
    this.name = "RepoCourseReadError";
  }
}

let trees: Promise<CourseTree[]> | undefined;

async function readRepoCourses(): Promise<CourseTree[]> {
  const every = await readEveryCourse({ fs: nodeCourseFs, root: () => REPO_COURSE_ROOT });
  if (every.kind === "root-failure")
    throw new RepoCourseReadError(describeCourseFailure(every.error));
  const read: CourseTree[] = [];
  for (const course of every.courses) {
    if (course.kind === "course-failure") {
      throw new RepoCourseReadError(describeCourseFailure(course.error));
    }
    read.push(course.tree);
  }
  return read;
}

/** Every course of the repository, in list order. */
export function repoCourses(): Promise<CourseTree[]> {
  trees ??= readRepoCourses();
  return trees;
}

/** The first course: what the one-course dashboard, top bar and specs show until #241. */
export async function repoCourse(): Promise<CourseTree> {
  const [first] = await repoCourses();
  if (first === undefined) throw new RepoCourseReadError("no course");
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
