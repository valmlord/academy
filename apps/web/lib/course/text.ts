import { CourseFileError, LessonTextReadError } from "./errors";
import type { CourseFs } from "./node-fs";

export type LessonTextKind = "theory" | "task";

/** A visible lesson's theory.md or task.md; a failure affects only that tab (ADR-0009 item 7). */
export async function readLessonText(
  fs: CourseFs,
  root: string,
  lessonDir: string,
  kind: LessonTextKind,
): Promise<string> {
  try {
    return await fs.readText(root, `${lessonDir}/${kind}.md`);
  } catch (error) {
    if (error instanceof CourseFileError) {
      throw new LessonTextReadError(error.file, error.reason);
    }
    throw error;
  }
}
