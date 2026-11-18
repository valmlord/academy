import { constants, type Stats } from "node:fs";
import { lstat, open, stat } from "node:fs/promises";
import { join } from "node:path";
import { CourseReadError } from "../errors.js";

/** How messages name the course root itself, whose relative path is empty. */
export const COURSE_ROOT_NAME = ".";

// Closed reasons (design 5.4). Shared with the starter rules, which report the same file states.
export const MISSING = "missing";
export const NOT_A_DIRECTORY = "not-a-directory";
export const NOT_A_REGULAR_FILE = "not-a-regular-file";
export const SYMLINK = "symlink";
export const INVALID_PATH = "invalid-path";
export const TOO_LARGE = "too-large";
export const CHANGED_DURING_READ = "changed-during-read";

/** Course YAML files are a few KB; anything near this size is a mistake, not a lesson. */
const MAX_YAML_BYTES = 1024 * 1024;
const ERRNO_CODE = /^E[A-Z0-9]+$/;

/**
 * The closed reason for a file-system error, or `undefined` for an error that is not a file state (a
 * programming error the caller rethrows). Only the code is used: the message holds the absolute path.
 */
export function fsFailureReason(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const { code } = error;
  if (typeof code !== "string" || !ERRNO_CODE.test(code)) return undefined;
  if (code === "ENOENT") return MISSING;
  if (code === "ENOTDIR") return NOT_A_DIRECTORY;
  // O_NOFOLLOW on a symlink fails with ELOOP.
  if (code === "ELOOP") return SYMLINK;
  return `unreadable (${code})`;
}

async function withReason<T>(rel: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const reason = fsFailureReason(error);
    if (reason === undefined) throw error;
    throw new CourseReadError(rel === "" ? COURSE_ROOT_NAME : rel, reason);
  }
}

async function requireRootDirectory(root: string): Promise<void> {
  // The root itself may be reached through a link (a bind mount, macOS /tmp); only what is below it counts.
  const stats = await withReason("", () => stat(root));
  if (!stats.isDirectory()) throw new CourseReadError(COURSE_ROOT_NAME, NOT_A_DIRECTORY);
}

/**
 * `lstat` of every segment of `rel` below the course root, refusing a symlink anywhere on the way
 * (ADR-0009 item 2: the real path equals the logical path). A segment that is not followed means a link
 * cannot redirect the read, whatever it points to. A symlink or non-directory refusal names the offending
 * segment; a missing or unreadable one names `rel`.
 */
export async function lstatBelowRoot(root: string, rel: string): Promise<Stats> {
  const segments = rel.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new CourseReadError(rel === "" ? COURSE_ROOT_NAME : rel, INVALID_PATH);
  }
  await requireRootDirectory(root);
  let current = root;
  let stats: Stats | undefined;
  for (const [index, segment] of segments.entries()) {
    const segmentRel = segments.slice(0, index + 1).join("/");
    const path = join(current, segment);
    // A missing or unreadable segment names the requested file: that is what the caller asked for.
    const segmentStats = await withReason(rel, () => lstat(path));
    if (segmentStats.isSymbolicLink()) throw new CourseReadError(segmentRel, SYMLINK);
    if (index < segments.length - 1 && !segmentStats.isDirectory()) {
      throw new CourseReadError(segmentRel, NOT_A_DIRECTORY);
    }
    current = path;
    stats = segmentStats;
  }
  if (stats === undefined) throw new CourseReadError(rel, INVALID_PATH);
  return stats;
}

/**
 * The text of a regular course file. Opened without following a link, and the opened file must be the one
 * the segment walk saw, so a swap between the two cannot redirect the read; the read is bounded.
 */
export async function readCourseFile(root: string, rel: string): Promise<string> {
  const walked = await lstatBelowRoot(root, rel);
  if (!walked.isFile()) throw new CourseReadError(rel, NOT_A_REGULAR_FILE);
  if (walked.size > MAX_YAML_BYTES) throw new CourseReadError(rel, TOO_LARGE);
  const handle = await withReason(rel, () =>
    open(join(root, rel), constants.O_RDONLY | constants.O_NOFOLLOW),
  );
  try {
    const opened = await withReason(rel, () => handle.stat());
    if (!opened.isFile() || opened.dev !== walked.dev || opened.ino !== walked.ino) {
      throw new CourseReadError(rel, CHANGED_DURING_READ);
    }
    const buffer = Buffer.alloc(Math.min(opened.size, MAX_YAML_BYTES));
    const { bytesRead } = await withReason(rel, () => handle.read(buffer, 0, buffer.length, 0));
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/** The identity a walk recorded for a regular file, from `lstat` with `bigint: true`. */
export interface WalkedFileIdentity {
  dev: bigint;
  ino: bigint;
  size: number;
}

/** A gone path or a link where the walk saw a regular file: the tree changed after the walk. */
function readFailureReason(error: unknown): string | undefined {
  const reason = fsFailureReason(error);
  if (reason === MISSING || reason === SYMLINK) return CHANGED_DURING_READ;
  return reason;
}

/**
 * The bytes of one walked file. It is opened without following a link, and the open file must be the regular
 * file the walk saw (same `(dev, ino)` and size), so a file swapped between the walk and the read is refused
 * instead of copying whatever the new name points to. The read never exceeds the walked size. `refuse` turns
 * a closed reason into the caller's own error; an error that is not a file state is rethrown as it is.
 */
export async function readWalkedFile(
  path: string,
  expected: WalkedFileIdentity,
  refuse: (reason: string) => never,
): Promise<Buffer> {
  const fail = (error: unknown): never => {
    const reason = readFailureReason(error);
    if (reason === undefined) throw error;
    return refuse(reason);
  };
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(fail);
  try {
    const opened = await handle.stat({ bigint: true }).catch(fail);
    const isWalkedFile =
      opened.isFile() &&
      opened.dev === expected.dev &&
      opened.ino === expected.ino &&
      Number(opened.size) === expected.size;
    if (!isWalkedFile) return refuse(CHANGED_DURING_READ);
    const buffer = Buffer.alloc(expected.size);
    let offset = 0;
    while (offset < expected.size) {
      const { bytesRead } = await handle
        .read(buffer, offset, expected.size - offset, offset)
        .catch(fail);
      if (bytesRead === 0) return refuse(CHANGED_DURING_READ);
      offset += bytesRead;
    }
    return buffer;
  } finally {
    await handle.close();
  }
}
