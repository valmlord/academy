import { createDb, type DbHandle, lessonProgress } from "@academy/db";
import { sql } from "drizzle-orm";
import type { EveryCourse } from "../course/courses";
import { describeCourseFailure, describeCourseId } from "../course/errors";
import type { CourseTree } from "../course/read";
import { findLesson } from "../course/view";
import { describeDbError } from "../db-error";
import { applyLessonOutcome, type OutcomeWrite } from "./outcome-writer";
import { type CheckKind, SHIPPED_CHECK_KINDS } from "./shipped-kinds";

// Web startup step (b) of ADR-0007 rule 7 as amended by #101: course content and the shipped kinds change
// only with a new web process, so every stored outcome is recomputed once before the first request. A
// stale status is tolerable (the next result commit converges it) and a site that refuses to start is
// not, so nothing here exits the process.

/**
 * A finish holds the row lock for milliseconds; a lock held by an overlapping process (pnpm dev against
 * the same database) would otherwise hold register(), and every request, without bound until compose
 * marks web unhealthy with no log line.
 */
export const STARTUP_ROW_LOCK_TIMEOUT_MS = 2000;

export interface RecomputeDeps {
  databaseUrl: string;
  readCourses: () => Promise<EveryCourse>;
  logInfo: (line: string) => void;
  logError: (line: string) => void;
  shippedKinds?: ReadonlySet<CheckKind>;
}

interface ProgressKey {
  userId: string;
  courseId: string;
  lessonId: string;
}

/** Changed means the status moved or a closure was written. */
function isWriteChange(write: OutcomeWrite): boolean {
  return write.isChanged || write.closedCheckIds.length > 0;
}

const SKIPPED = "web: lesson outcome recompute skipped:";

interface ReadableCourses {
  trees: Map<string, CourseTree>;
  failingCourseIds: Set<string>;
}

/** The readable trees and the failing course ids; logs each failing course once, or the root failure. */
async function readCoursesOrLog(deps: RecomputeDeps): Promise<ReadableCourses | undefined> {
  let every: EveryCourse;
  try {
    every = await deps.readCourses();
  } catch (error: unknown) {
    deps.logError(`web: lesson outcome recompute failed: ${describeDbError(error)}`);
    return undefined;
  }
  if (every.kind === "root-failure") {
    deps.logError(`${SKIPPED} ${describeCourseFailure(every.error)}`);
    return undefined;
  }
  const courses: ReadableCourses = { trees: new Map(), failingCourseIds: new Set() };
  for (const course of every.courses) {
    if (course.kind === "course") {
      courses.trees.set(course.tree.id, course.tree);
    } else {
      courses.failingCourseIds.add(course.error.courseId);
      deps.logError(`${SKIPPED} ${describeCourseFailure(course.error)}`);
    }
  }
  return courses;
}

// Progress of a course id with no directory, e.g. a renamed course (ADR-0009 Consequences); renaming the
// directory back restores it. Ascending ids, so the lines are stable from one start to the next.
function logUnlistedCourses(deps: RecomputeDeps, rowsByCourseId: Map<string, number>): void {
  for (const courseId of [...rowsByCourseId.keys()].sort()) {
    deps.logError(
      `${SKIPPED} course ${describeCourseId(courseId)}: no course directory, rows: ${rowsByCourseId.get(courseId)}`,
    );
  }
}

async function selectRowsOrLog(
  handle: DbHandle,
  deps: RecomputeDeps,
): Promise<ProgressKey[] | undefined> {
  try {
    // Every status, completed included: a lowered limit can close a check added after completion, and
    // D4 needs that closure persisted although the status stays completed.
    return await handle.db
      .select({
        userId: lessonProgress.userId,
        courseId: lessonProgress.courseId,
        lessonId: lessonProgress.lessonId,
      })
      .from(lessonProgress);
  } catch (error: unknown) {
    deps.logError(`web: lesson outcome recompute failed: ${describeDbError(error)}`);
    return undefined;
  }
}

export async function recomputeOutcomesOnStartup(deps: RecomputeDeps): Promise<void> {
  const startedAt = performance.now();
  const courses = await readCoursesOrLog(deps);
  if (courses === undefined) return;
  const shippedKinds = deps.shippedKinds ?? SHIPPED_CHECK_KINDS;
  let handle: DbHandle;
  try {
    handle = createDb(deps.databaseUrl);
  } catch (error: unknown) {
    deps.logError(`web: lesson outcome recompute failed: ${describeDbError(error)}`);
    return;
  }
  try {
    const rows = await selectRowsOrLog(handle, deps);
    if (rows === undefined) return;
    let changed = 0;
    let skipped = 0;
    let failed = 0;
    const unlistedRows = new Map<string, number>();
    for (const row of rows) {
      // Rows of a failing course, of a course id with no directory or of a lesson not visible are left alone
      // (ADR-0009 items 5 and 8).
      const tree = courses.trees.get(row.courseId);
      if (tree === undefined && !courses.failingCourseIds.has(row.courseId)) {
        unlistedRows.set(row.courseId, (unlistedRows.get(row.courseId) ?? 0) + 1);
      }
      const found = tree === undefined ? undefined : findLesson(tree, row.lessonId);
      if (found === undefined) {
        skipped += 1;
        continue;
      }
      const target = { userId: row.userId, courseId: row.courseId, lesson: found.node.lesson };
      try {
        // One transaction per row, so one locked or failing row cannot leave every later row stale.
        const write = await handle.db.transaction(
          async (tx) => {
            // SET takes no bind parameter; set_config with is_local true is SET LOCAL.
            await tx.execute(
              sql`SELECT set_config('lock_timeout', ${`${STARTUP_ROW_LOCK_TIMEOUT_MS}ms`}, true)`,
            );
            return applyLessonOutcome(tx, target, shippedKinds);
          },
          { isolationLevel: "read committed" },
        );
        if (isWriteChange(write)) changed += 1;
      } catch (error: unknown) {
        failed += 1;
        // Only rows of a visible lesson get here, so both ids are course slugs; no user id is logged.
        deps.logError(
          `web: lesson outcome recompute failed for ${row.courseId}/${row.lessonId}: ${describeDbError(error)}`,
        );
      }
    }
    logUnlistedCourses(deps, unlistedRows);
    const elapsedMs = Math.round(performance.now() - startedAt);
    deps.logInfo(
      `web: lesson outcomes recomputed: ${rows.length} rows, ${changed} changed, ${skipped} skipped, ${failed} failed in ${elapsedMs} ms`,
    );
  } finally {
    await handle.close();
  }
}
