import type { BigIntStats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { HIDDEN_DIR } from "@academy/lesson-schema/schema";
import { CourseReadError, StarterRefusedError } from "../errors.js";
import { fsFailureReason, lstatBelowRoot, MISSING, NOT_A_DIRECTORY, SYMLINK } from "./files.js";

// Closed reasons of design 5.4 that only the starter rules produce.
export const DOT_PATH = "dot-path";
export const HIDDEN = "hidden-dir";
export const OUTSIDE_LESSON = "outside-lesson";

const DEFAULT_IGNORABLE = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * Rule 4a's folded form of a name: NFKC (fullwidth letters to ASCII, LONG S to `s`, KELVIN SIGN to `K`),
 * then every default-ignorable code point removed (a ZERO WIDTH JOINER or SOFT HYPHEN inside a name), then
 * lower-cased. Pure string logic, so it decides the same way on every filesystem: a grader directory cannot
 * be reached under a spelling that one filesystem treats as the same name and this check does not.
 */
export function foldName(segment: string): string {
  return segment.normalize("NFKC").replace(DEFAULT_IGNORABLE, "").toLowerCase();
}

/** Whether a path segment names the grader directory under any spelling rule 4a knows. */
export function isHiddenSegment(segment: string): boolean {
  return foldName(segment) === HIDDEN_DIR;
}

/** A directory entry by name and file identity. */
export interface EntryIdentity {
  name: string;
  dev: bigint;
  ino: bigint;
}

/**
 * Rule 4b: two entries are the same file exactly when `(dev, ino)` match, whatever their names; this catches
 * a second name for `checks` that the fold does not know (a case-insensitive or bind-mounted filesystem).
 */
export function isSameEntry(a: EntryIdentity, b: EntryIdentity): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

export interface ResolvedStarter {
  /** Relative to the course root. */
  lessonDir: string;
  /** Relative to the course root. */
  starterDir: string;
  lessonPath: string;
  starterPath: string;
  lesson: EntryIdentity;
  /** `null` when the lesson has no `checks` directory. */
  checks: EntryIdentity | null;
}

function identityOf(name: string, stats: BigIntStats): EntryIdentity {
  return { name, dev: stats.dev, ino: stats.ino };
}

async function lstatOrRefuse(path: string, rel: string): Promise<BigIntStats> {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    const reason = fsFailureReason(error);
    if (reason === undefined) throw error;
    throw new StarterRefusedError(rel, reason);
  }
}

async function optionalIdentity(
  path: string,
  rel: string,
  name: string,
): Promise<EntryIdentity | null> {
  try {
    return identityOf(name, await lstat(path, { bigint: true }));
  } catch (error) {
    const reason = fsFailureReason(error);
    if (reason === MISSING) return null;
    if (reason === undefined) throw error;
    throw new StarterRefusedError(rel, reason);
  }
}

/** Rules 3 and 4a on the text of the starter path, before any file-system call. */
function refuseByText(starterRel: string, starter: string): string[] {
  const segments = starter.split("/");
  if (segments.some(isHiddenSegment)) throw new StarterRefusedError(starterRel, HIDDEN);
  if (segments.some((segment) => segment === "" || segment === ".")) {
    throw new StarterRefusedError(starterRel, DOT_PATH);
  }
  if (segments.includes("..")) throw new StarterRefusedError(starterRel, OUTSIDE_LESSON);
  return segments;
}

async function lessonIdentity(root: string, lessonDir: string): Promise<EntryIdentity> {
  try {
    const stats = await lstatBelowRoot(root, lessonDir);
    if (!stats.isDirectory()) throw new StarterRefusedError(lessonDir, NOT_A_DIRECTORY);
  } catch (error) {
    if (error instanceof CourseReadError) throw new StarterRefusedError(error.file, error.reason);
    throw error;
  }
  return identityOf(lessonDir, await lstatOrRefuse(join(root, lessonDir), lessonDir));
}

/**
 * The starter directory of a lesson (design 5.4 rules 1, 3-6), or `StarterRefusedError`. The text rules run
 * first and need no file system; then every segment below the lesson is `lstat`ed (never followed) and
 * compared by identity with the lesson's `checks` directory, and the final directory with the lesson itself.
 */
export async function resolveStarter(
  root: string,
  lessonDir: string,
  starter: string,
): Promise<ResolvedStarter> {
  const starterDir = `${lessonDir}/${starter}`;
  const segments = refuseByText(starterDir, starter);
  const lesson = await lessonIdentity(root, lessonDir);
  const lessonPath = join(root, lessonDir);
  const checks = await optionalIdentity(
    join(lessonPath, HIDDEN_DIR),
    `${lessonDir}/${HIDDEN_DIR}`,
    HIDDEN_DIR,
  );
  let current = lessonPath;
  let entry = lesson;
  for (const [index, segment] of segments.entries()) {
    const rel = `${lessonDir}/${segments.slice(0, index + 1).join("/")}`;
    current = join(current, segment);
    const stats = await lstatOrRefuse(current, rel);
    if (stats.isSymbolicLink()) throw new StarterRefusedError(rel, SYMLINK);
    if (!stats.isDirectory()) throw new StarterRefusedError(rel, NOT_A_DIRECTORY);
    entry = identityOf(segment, stats);
    if (checks !== null && isSameEntry(entry, checks)) throw new StarterRefusedError(rel, HIDDEN);
  }
  if (isSameEntry(entry, lesson)) throw new StarterRefusedError(starterDir, DOT_PATH);
  // Rule 5: with no link on the way this always holds; it is the last line if a rule above is ever weakened.
  const [realLesson, realStarter] = await Promise.all([realpath(lessonPath), realpath(current)]);
  if (realStarter !== join(realLesson, ...segments)) {
    throw new StarterRefusedError(starterDir, OUTSIDE_LESSON);
  }
  return { lessonDir, starterDir, lessonPath, starterPath: current, lesson, checks };
}
