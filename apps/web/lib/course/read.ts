import { type Course, Lesson, Module } from "@academy/lesson-schema/schema";
import { CourseFileError } from "./errors";
import type { CourseFs } from "./node-fs";
import { parseYamlFile } from "./yaml";

export interface LessonNode {
  /** Relative to the course root. */
  dir: string;
  /** The two-digit prefix of the directory name. */
  number: string;
  lesson: Lesson;
}

export interface ModuleNode {
  dir: string;
  number: string;
  module: Module;
  lessons: LessonNode[];
}

export interface CourseTree {
  id: string;
  title: string;
  description: string;
  dir: string;
  modules: ModuleNode[];
}

export const COURSE_FILE = "course.yaml";

// The part of a zod schema this module uses; the web does not depend on zod itself.
type ParseResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { issues: readonly { path: readonly PropertyKey[]; code: string }[] };
    };
interface Schema<T> {
  safeParse(value: unknown): ParseResult<T>;
}

/** The validated content of one YAML file; every failure is a `CourseFileError` naming that file. */
export async function parseFile<T>(
  fs: CourseFs,
  root: string,
  file: string,
  schema: Schema<T>,
): Promise<T> {
  const value = parseYamlFile(await fs.readText(root, file), file);
  const result = schema.safeParse(value);
  if (!result.success) {
    // Path and code only: a zod message can echo the input (the duplicate check id does).
    const issue = result.error.issues[0];
    const reason =
      issue === undefined ? "schema" : `schema: ${issue.path.map(String).join(".")} ${issue.code}`;
    throw new CourseFileError(file, reason);
  }
  return result.data;
}

/**
 * Every module.yaml and lesson.yaml `course` lists, validated against the lesson contract; lesson ids are
 * unique within this course only. Never opens a Markdown file.
 */
export async function readModules(
  fs: CourseFs,
  root: string,
  courseDir: string,
  course: Course,
): Promise<ModuleNode[]> {
  const modules: ModuleNode[] = [];
  const lessonIds = new Set<string>();
  for (const moduleName of course.modules) {
    const dir = `${courseDir}/${moduleName}`;
    const module = await parseFile(fs, root, `${dir}/module.yaml`, Module);
    const lessons: LessonNode[] = [];
    for (const lessonName of module.lessons) {
      const lessonDir = `${dir}/${lessonName}`;
      const file = `${lessonDir}/lesson.yaml`;
      const lesson = await parseFile(fs, root, file, Lesson);
      if (lessonIds.has(lesson.id)) {
        throw new CourseFileError(file, `duplicate lesson id ${lesson.id}`);
      }
      lessonIds.add(lesson.id);
      lessons.push({ dir: lessonDir, number: lessonName.slice(0, 2), lesson });
    }
    modules.push({ dir, number: moduleName.slice(0, 2), module, lessons });
  }
  return modules;
}
