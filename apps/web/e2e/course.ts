import path from "node:path";
import { nodeCourseFs } from "../lib/course/node-fs";
import { type CourseTree, readCourse } from "../lib/course/read";
import { readLessonText } from "../lib/course/text";
import {
  type CatalogView,
  findLesson,
  type LessonView,
  toCatalogView,
  toLessonView,
} from "../lib/course/view";

// Expectations come from the repository's own course/, read by the same loader and views as the app,
// so no count or title is written into a spec. Deliberately not COURSE_ROOT: the image under test was
// built from this course/, whatever a shell variable says.
export const REPO_COURSE_ROOT = path.join(import.meta.dirname, "../../../course");

let tree: Promise<CourseTree> | undefined;

export function repoCourse(): Promise<CourseTree> {
  tree ??= readCourse(nodeCourseFs, REPO_COURSE_ROOT);
  return tree;
}

export async function repoCatalog(): Promise<CatalogView> {
  return toCatalogView(await repoCourse());
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
