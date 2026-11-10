import { createDb, type DbHandle, lessonProgress } from "@academy/db";
import { sql } from "drizzle-orm";
import { CourseReadError } from "../course/errors";
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
  readTree: () => Promise<CourseTree>;
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

async function readTreeOrLog(deps: RecomputeDeps): Promise<CourseTree | undefined> {
  try {
    return await deps.readTree();
  } catch (error: unknown) {
    if (error instanceof CourseReadError) {
      deps.logError(
        `web: lesson outcome recompute skipped: course unreadable (${error.file}: ${error.reason})`,
      );
    } else {
      deps.logError(`web: lesson outcome recompute failed: ${describeDbError(error)}`);
    }
    return undefined;
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
  const tree = await readTreeOrLog(deps);
  if (tree === undefined) return;
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
    for (const row of rows) {
      // Rows of other courses or of lessons not visible are left alone (ADR-0009 item 5).
      const found = row.courseId === tree.id ? findLesson(tree, row.lessonId) : undefined;
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
    const elapsedMs = Math.round(performance.now() - startedAt);
    deps.logInfo(
      `web: lesson outcomes recomputed: ${rows.length} rows, ${changed} changed, ${skipped} skipped, ${failed} failed in ${elapsedMs} ms`,
    );
  } finally {
    await handle.close();
  }
}
