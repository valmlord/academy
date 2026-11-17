import type { BigIntStats } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { HIDDEN_DIR } from "@academy/lesson-schema/schema";
import { ChecksRefusedError, CourseReadError } from "../errors.js";
import {
  fsFailureReason,
  lstatBelowRoot,
  NOT_A_DIRECTORY,
  readWalkedFile,
  SYMLINK,
  TOO_LARGE,
} from "./files.js";
import { HARD_LINK, normalisedMode, SPECIAL_FILE, type StarterItem } from "./starter.js";

// The starter's caps (design 10): the largest real `checks/` is 1.18 MB in 156 entries, and the buffered tar
// of one check must not hurt the service.
export const MAX_CHECKS_BYTES = 8 * 1024 * 1024;
export const MAX_CHECKS_ENTRIES = 2000;

export interface ChecksCaps {
  maxBytes: number;
  maxEntries: number;
}

const DEFAULT_CHECKS_CAPS: ChecksCaps = {
  maxBytes: MAX_CHECKS_BYTES,
  maxEntries: MAX_CHECKS_ENTRIES,
};

/** One entry of `checks/` ready for the tar; `rel` is relative to the checks directory. */
export type ChecksItem = StarterItem;

interface WalkedChecksEntry {
  /** Relative to the checks directory. */
  rel: string;
  path: string;
  kind: "directory" | "file";
  mode: number;
  size: number;
  dev: bigint;
  ino: bigint;
}

function refuseFsFailure(rel: string, error: unknown): never {
  const reason = fsFailureReason(error);
  if (reason === undefined) throw error;
  throw new ChecksRefusedError(rel, reason);
}

/** Nothing is followed: a link, a second name or a special file is refused wherever it points. */
function classify(stats: BigIntStats, rel: string): WalkedChecksEntry["kind"] {
  if (stats.isSymbolicLink()) throw new ChecksRefusedError(rel, SYMLINK);
  if (stats.isDirectory()) return "directory";
  if (!stats.isFile()) throw new ChecksRefusedError(rel, SPECIAL_FILE);
  if (stats.nlink !== 1n) throw new ChecksRefusedError(rel, HARD_LINK);
  return "file";
}

/**
 * Every entry below `checksRel` in a stable order (names sorted, each directory before its contents),
 * walked with `lstat`. The caps are checked during the walk, so a huge tree is refused without being walked
 * to the end, and before any file is read.
 */
async function walkChecks(
  root: string,
  checksRel: string,
  caps: ChecksCaps,
): Promise<WalkedChecksEntry[]> {
  const entries: WalkedChecksEntry[] = [];
  let totalBytes = 0;
  const visit = async (dirPath: string, dirRel: string): Promise<void> => {
    const courseDirRel = dirRel === "" ? checksRel : `${checksRel}/${dirRel}`;
    const names = await readdir(dirPath).catch((error: unknown) =>
      refuseFsFailure(courseDirRel, error),
    );
    for (const name of names.sort()) {
      const itemRel = dirRel === "" ? name : `${dirRel}/${name}`;
      const rel = `${checksRel}/${itemRel}`;
      const path = join(dirPath, name);
      const stats = await lstat(path, { bigint: true }).catch((error: unknown) =>
        refuseFsFailure(rel, error),
      );
      const kind = classify(stats, rel);
      const size = kind === "file" ? Number(stats.size) : 0;
      totalBytes += size;
      if (entries.length + 1 > caps.maxEntries || totalBytes > caps.maxBytes) {
        throw new ChecksRefusedError(checksRel, TOO_LARGE);
      }
      entries.push({
        rel: itemRel,
        path,
        kind,
        mode: Number(stats.mode),
        size,
        dev: stats.dev,
        ino: stats.ino,
      });
      if (kind === "directory") await visit(path, itemRel);
    }
  };
  await visit(join(root, checksRel), "");
  return entries;
}

/**
 * A lesson's `checks/` directory, walked and read for the grader, or `ChecksRefusedError`: every refusal
 * happens before anything is delivered. `caps` exists so a unit test can use small caps.
 */
export async function loadChecks(
  root: string,
  lessonDir: string,
  caps: ChecksCaps = DEFAULT_CHECKS_CAPS,
): Promise<ChecksItem[]> {
  const checksRel = `${lessonDir}/${HIDDEN_DIR}`;
  const top = await lstatBelowRoot(root, checksRel).catch((error: unknown) => {
    if (error instanceof CourseReadError) throw new ChecksRefusedError(error.file, error.reason);
    throw error;
  });
  if (!top.isDirectory()) throw new ChecksRefusedError(checksRel, NOT_A_DIRECTORY);
  const items: ChecksItem[] = [];
  for (const entry of await walkChecks(root, checksRel, caps)) {
    const rel = `${checksRel}/${entry.rel}`;
    const content =
      entry.kind === "file"
        ? await readWalkedFile(entry.path, entry, (reason) => {
            throw new ChecksRefusedError(rel, reason);
          })
        : null;
    items.push({ rel: entry.rel, kind: entry.kind, mode: normalisedMode(entry), content });
  }
  return items;
}
