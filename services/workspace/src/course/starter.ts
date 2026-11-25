import type { BigIntStats } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { HIDDEN_DIR } from "@academy/lesson-schema/schema";
import { CourseFileError, StarterRefusedError, StarterTooLargeError } from "../errors.js";
import {
  fsFailureReason,
  lstatBelowRoot,
  MISSING,
  NOT_A_DIRECTORY,
  readWalkedFile,
  SYMLINK,
} from "./files.js";

// Closed reasons of design 5.4 that only the starter rules produce.
export const DOT_PATH = "dot-path";
export const HIDDEN = "hidden-dir";
export const OUTSIDE_LESSON = "outside-lesson";
export const GRADER_FILE = "grader-file";
export const SPECIAL_FILE = "special-file";
export const HARD_LINK = "hard-link";

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
    if (error instanceof CourseFileError) throw new StarterRefusedError(error.file, error.reason);
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

// Caps of design 4.4: far above any real starter (the largest in the course is a few hundred KB), low
// enough that the buffered tar of one ensure cannot hurt the service.
export const MAX_STARTER_BYTES = 8 * 1024 * 1024;
export const MAX_STARTER_ENTRIES = 2000;
const QUIZ_FILE = "quiz.yaml";

/** One walked starter entry; `rel` is relative to the starter directory, `/`-separated. */
export interface StarterEntry {
  rel: string;
  path: string;
  kind: "directory" | "file";
  mode: number;
  size: number;
  dev: bigint;
  ino: bigint;
}

function identityKey(dev: bigint, ino: bigint): string {
  return `${dev}:${ino}`;
}

async function readdirOrRefuse(path: string, rel: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (error) {
    const reason = fsFailureReason(error);
    if (reason === undefined) throw error;
    throw new StarterRefusedError(rel, reason);
  }
}

/**
 * Rule 7: the identity of `<lesson>/checks`, of every entry below it (walked with `lstat`, never followed),
 * and of `<lesson>/quiz.yaml`. A starter entry with one of these identities is grader material under another
 * name.
 */
async function graderIdentities(resolved: ResolvedStarter): Promise<Set<string>> {
  const identities = new Set<string>();
  const pending: { path: string; rel: string }[] = [];
  if (resolved.checks !== null) {
    identities.add(identityKey(resolved.checks.dev, resolved.checks.ino));
    pending.push({
      path: join(resolved.lessonPath, HIDDEN_DIR),
      rel: `${resolved.lessonDir}/${HIDDEN_DIR}`,
    });
  }
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const name of await readdirOrRefuse(next.path, next.rel)) {
      const path = join(next.path, name);
      const rel = `${next.rel}/${name}`;
      const stats = await lstatOrRefuse(path, rel);
      identities.add(identityKey(stats.dev, stats.ino));
      if (stats.isDirectory()) pending.push({ path, rel });
    }
  }
  const quiz = await optionalIdentity(
    join(resolved.lessonPath, QUIZ_FILE),
    `${resolved.lessonDir}/${QUIZ_FILE}`,
    QUIZ_FILE,
  );
  if (quiz !== null) identities.add(identityKey(quiz.dev, quiz.ino));
  return identities;
}

/** Rules 7 and 8 for one walked entry; returns its kind or throws the refusal. */
function classify(stats: BigIntStats, rel: string, grader: Set<string>): StarterEntry["kind"] {
  if (grader.has(identityKey(stats.dev, stats.ino)))
    throw new StarterRefusedError(rel, GRADER_FILE);
  if (stats.isSymbolicLink()) throw new StarterRefusedError(rel, SYMLINK);
  if (stats.isDirectory()) return "directory";
  if (!stats.isFile()) throw new StarterRefusedError(rel, SPECIAL_FILE);
  // A git checkout never creates a second name for a file, so one is refused wherever it points.
  if (stats.nlink > 1n) throw new StarterRefusedError(rel, HARD_LINK);
  return "file";
}

/**
 * Every entry below the starter directory in a stable order (names sorted, each directory before its
 * contents), refused by rules 7-9 before any file is read. Nothing is followed, and the caps are checked
 * during the walk, so a huge tree is refused without being walked to the end.
 */
export async function walkStarter(resolved: ResolvedStarter): Promise<StarterEntry[]> {
  const grader = await graderIdentities(resolved);
  const entries: StarterEntry[] = [];
  let totalBytes = 0;
  const visit = async (dirPath: string, dirRel: string): Promise<void> => {
    const courseRel = dirRel === "" ? resolved.starterDir : `${resolved.starterDir}/${dirRel}`;
    const names = (await readdirOrRefuse(dirPath, courseRel)).sort();
    for (const name of names) {
      const rel = dirRel === "" ? name : `${dirRel}/${name}`;
      const path = join(dirPath, name);
      const stats = await lstatOrRefuse(path, `${resolved.starterDir}/${rel}`);
      const kind = classify(stats, `${resolved.starterDir}/${rel}`, grader);
      const size = kind === "file" ? Number(stats.size) : 0;
      totalBytes += size;
      if (entries.length + 1 > MAX_STARTER_ENTRIES) {
        throw new StarterTooLargeError(resolved.starterDir, `${MAX_STARTER_ENTRIES} entries`);
      }
      if (totalBytes > MAX_STARTER_BYTES) {
        throw new StarterTooLargeError(resolved.starterDir, `${MAX_STARTER_BYTES} bytes`);
      }
      entries.push({
        rel,
        path,
        kind,
        mode: Number(stats.mode),
        size,
        dev: stats.dev,
        ino: stats.ino,
      });
      if (kind === "directory") await visit(path, rel);
    }
  };
  await visit(resolved.starterPath, "");
  return entries;
}

// Ownership comes from the tar headers (design 4.4); only the execute bit survives from the course file.
const DIRECTORY_MODE = 0o755;
const FILE_MODE = 0o644;
const EXECUTABLE_FILE_MODE = 0o755;
const ANY_EXECUTE_BIT = 0o111;

/** The mode an entry gets in the workspace: directories 0755, files 0644, or 0755 when any execute bit is set. */
export function normalisedMode(entry: Pick<StarterEntry, "kind" | "mode">): number {
  if (entry.kind === "directory") return DIRECTORY_MODE;
  return (entry.mode & ANY_EXECUTE_BIT) !== 0 ? EXECUTABLE_FILE_MODE : FILE_MODE;
}

/**
 * Rule 10: the bytes of one walked file, through `readWalkedFile`, so a file swapped between the walk and the
 * read is refused with the starter's own error.
 */
export async function readStarterFile(
  resolved: ResolvedStarter,
  entry: StarterEntry,
): Promise<Buffer> {
  const rel = `${resolved.starterDir}/${entry.rel}`;
  return readWalkedFile(entry.path, entry, (reason) => {
    throw new StarterRefusedError(rel, reason);
  });
}

/** One starter entry ready for the tar: path below the starter, normalised mode, and a file's bytes. */
export interface StarterItem {
  rel: string;
  kind: "directory" | "file";
  mode: number;
  content: Buffer | null;
}

/** Resolve, walk and read a lesson's starter: every refusal happens before anything is copied. */
export async function loadStarter(
  root: string,
  lessonDir: string,
  starter: string,
): Promise<StarterItem[]> {
  const resolved = await resolveStarter(root, lessonDir, starter);
  const items: StarterItem[] = [];
  for (const entry of await walkStarter(resolved)) {
    const content = entry.kind === "file" ? await readStarterFile(resolved, entry) : null;
    items.push({ rel: entry.rel, kind: entry.kind, mode: normalisedMode(entry), content });
  }
  return items;
}
