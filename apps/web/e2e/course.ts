import path from "node:path";
import { nodeCourseFs } from "../lib/course/node-fs";
import { type CourseTree, readCourse } from "../lib/course/read";
import { type CatalogView, toCatalogView } from "../lib/course/view";

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
