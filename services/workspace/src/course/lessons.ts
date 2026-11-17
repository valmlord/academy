import { readdir } from "node:fs/promises";
import { Course, Lesson, Module } from "@academy/lesson-schema/schema";
import { CourseReadError, LessonNotFoundError } from "../errors.js";
import {
  COURSE_ROOT_NAME,
  fsFailureReason,
  lstatBelowRoot,
  MISSING,
  readCourseFile,
} from "./files.js";
import { parseYamlFile } from "./yaml.js";

/** What a lesson's `workspace` block gives the service: the image and the starter path inside the lesson. */
export interface LessonWorkspace {
  image: string;
  starter: string;
}

/** What a `kind: command` check gives the service: the shell text it runs and its time limit. */
export interface CommandCheck {
  id: string;
  run: string;
  timeoutSec: number;
}

export interface CourseLesson {
  courseId: string;
  lessonId: string;
  /** The lesson directory relative to the course root. */
  lessonDir: string;
  /** `null` for a lesson without a workspace (HTTP 422 `lesson-has-no-workspace`). */
  workspace: LessonWorkspace | null;
  /** The lesson's command checks in lesson order; the other check kinds are not the service's. */
  commandChecks: CommandCheck[];
}

/** Every lesson of the course by `(courseId, lessonId)`, so a caller tells "no such lesson" from "no workspace". */
export class CourseLessons {
  readonly #lessons = new Map<string, CourseLesson>();

  constructor(lessons: readonly CourseLesson[]) {
    for (const lesson of lessons)
      this.#lessons.set(lookupKey(lesson.courseId, lesson.lessonId), lesson);
  }

  find(courseId: string, lessonId: string): CourseLesson | undefined {
    return this.#lessons.get(lookupKey(courseId, lessonId));
  }

  /** The lesson, or `LessonNotFoundError`. */
  lesson(courseId: string, lessonId: string): CourseLesson {
    const lesson = this.find(courseId, lessonId);
    if (lesson === undefined) throw new LessonNotFoundError(courseId, lessonId);
    return lesson;
  }

  all(): CourseLesson[] {
    return [...this.#lessons.values()];
  }
}

// NUL cannot occur in a slug, so two different pairs never share a lookup key.
function lookupKey(courseId: string, lessonId: string): string {
  return `${courseId}\0${lessonId}`;
}

const COURSE_FILE = "course.yaml";

interface Schema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: readonly { path: readonly PropertyKey[]; code: string }[] };
      };
}

async function parseFile<T>(root: string, file: string, schema: Schema<T>): Promise<T> {
  const value = parseYamlFile(await readCourseFile(root, file), file);
  const result = schema.safeParse(value);
  if (!result.success) {
    // Path and code only: a zod message can echo the input (the duplicate check id message does).
    const issue = result.error.issues[0];
    const reason =
      issue === undefined ? "schema" : `schema: ${issue.path.map(String).join(".")} ${issue.code}`;
    throw new CourseReadError(file, reason);
  }
  return result.data;
}

function commandChecksOf(lesson: Lesson): CommandCheck[] {
  const checks: CommandCheck[] = [];
  for (const check of lesson.checks) {
    if (check.kind !== "command") continue;
    checks.push({
      id: check.id,
      run: check.run,
      timeoutSec: check.timeoutSec,
    });
  }
  return checks;
}

async function hasCourseFile(root: string, dir: string): Promise<boolean> {
  try {
    await lstatBelowRoot(root, `${dir}/${COURSE_FILE}`);
    return true;
  } catch (error) {
    if (error instanceof CourseReadError && error.reason === MISSING) return false;
    throw error;
  }
}

/** ADR-0009 item 6: the root holds exactly one course. Symlinked directories are not listed as directories. */
async function findCourseDir(root: string): Promise<string> {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    const reason = fsFailureReason(error);
    if (reason === undefined) throw error;
    throw new CourseReadError(COURSE_ROOT_NAME, reason);
  }
  const candidates: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && (await hasCourseFile(root, entry.name))) candidates.push(entry.name);
  }
  const [only] = candidates;
  if (only === undefined || candidates.length !== 1) {
    throw new CourseReadError(
      COURSE_ROOT_NAME,
      `expected exactly one course, found ${candidates.length}`,
    );
  }
  return only;
}

/**
 * The whole course, read once: `course.yaml`, every listed `module.yaml`, every listed `lesson.yaml`, with
 * the rules of design 5.4. All or nothing: any failure anywhere throws one `CourseReadError`, matching the
 * web, which puts the whole course into its error state; a reader that skipped a bad lesson would let
 * reconcile treat that lesson's workspaces as orphans.
 */
export async function readCourseLessons(root: string): Promise<CourseLessons> {
  const courseDir = await findCourseDir(root);
  const course = await parseFile(root, `${courseDir}/${COURSE_FILE}`, Course);
  const lessons: CourseLesson[] = [];
  const lessonIds = new Set<string>();
  for (const moduleName of course.modules) {
    const moduleDir = `${courseDir}/${moduleName}`;
    const module = await parseFile(root, `${moduleDir}/module.yaml`, Module);
    for (const lessonName of module.lessons) {
      const lessonDir = `${moduleDir}/${lessonName}`;
      const file = `${lessonDir}/lesson.yaml`;
      const lesson = await parseFile(root, file, Lesson);
      if (lessonIds.has(lesson.id))
        throw new CourseReadError(file, `duplicate lesson id ${lesson.id}`);
      lessonIds.add(lesson.id);
      const workspace = lesson.workspace ?? null;
      lessons.push({
        courseId: course.id,
        lessonId: lesson.id,
        lessonDir,
        workspace:
          workspace === null ? null : { image: workspace.image, starter: workspace.starter },
        commandChecks: commandChecksOf(lesson),
      });
    }
  }
  return new CourseLessons(lessons);
}
