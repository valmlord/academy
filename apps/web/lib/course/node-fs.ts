import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { COURSE_ROOT_FILE, CourseFileError } from "./errors";
import { LEARNER_FILES } from "./files";

// The only server-bundled module with node:fs calls. Every call carries turbopackIgnore, because a path
// Turbopack can resolve statically makes the build trace the files it reaches into the standalone output.

export interface CourseFs {
  /** The text of a learner file; throws `CourseFileError` for any refused or unreadable path. */
  readText(root: string, rel: string): Promise<string>;
  /** Names of the real (not symlinked) directories directly under `rel`. */
  listDirs(root: string, rel: string): Promise<string[]>;
}

export const MISSING = "missing";
export const NOT_A_REGULAR_FILE = "not a regular file";
export const OUTSIDE_THE_ROOT = "symlink or outside the course root";
export const NOT_A_LEARNER_FILE = "not a learner file";

const GRADER_SEGMENTS = new Set(["checks", "starter"]);
const ERRNO_CODE = /^E[A-Z0-9]+$/;

/**
 * The closed reason for a file-system error, or undefined for an error that is not a file state (a
 * programming error, rethrown by the caller). Only the code is used: the message holds the absolute path.
 */
export function fsFailureReason(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const { code } = error;
  if (typeof code !== "string" || !ERRNO_CODE.test(code)) return undefined;
  if (code === "ENOENT" || code === "ENOTDIR") return MISSING;
  if (code === "ELOOP") return OUTSIDE_THE_ROOT;
  if (code === "EISDIR") return NOT_A_REGULAR_FILE;
  return `unreadable (${code})`;
}

function refuseNonLearnerPath(rel: string): void {
  const segments = rel.split("/");
  const name = segments.at(-1) ?? "";
  if (!LEARNER_FILES.includes(name) || segments.some((segment) => GRADER_SEGMENTS.has(segment))) {
    throw new CourseFileError(rel, NOT_A_LEARNER_FILE);
  }
}

async function withReason<T>(rel: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const reason = fsFailureReason(error);
    if (reason === undefined) throw error;
    throw new CourseFileError(rel === "" ? COURSE_ROOT_FILE : rel, reason);
  }
}

/** The absolute path of `rel`, refused unless it is exactly `realpath(root)/rel` (no symlink, no `..`). */
async function verifiedPath(root: string, rel: string): Promise<string> {
  return withReason(rel, async () => {
    const realRoot = await realpath(/*turbopackIgnore: true*/ root);
    const expected = `${realRoot}/${rel}`;
    const real = await realpath(/*turbopackIgnore: true*/ path.join(root, rel));
    if (real !== expected) throw new CourseFileError(rel, OUTSIDE_THE_ROOT);
    const stats = await stat(/*turbopackIgnore: true*/ real);
    if (!stats.isFile()) throw new CourseFileError(rel, NOT_A_REGULAR_FILE);
    return real;
  });
}

export const nodeCourseFs: CourseFs = {
  async readText(root, rel) {
    refuseNonLearnerPath(rel);
    const file = await verifiedPath(root, rel);
    return withReason(rel, () => readFile(/*turbopackIgnore: true*/ file, "utf8"));
  },

  async listDirs(root, rel) {
    const entries = await withReason(rel, () =>
      readdir(/*turbopackIgnore: true*/ path.join(root, rel), { withFileTypes: true }),
    );
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  },
};
