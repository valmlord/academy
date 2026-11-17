import { posix } from "node:path";
import { pack } from "tar-stream";
import type { ChecksItem } from "../course/checks.js";
import { normalisedMode, type StarterItem } from "../course/starter.js";
import {
  GRADER_SCRATCH_ROOT,
  LEARNER_GID,
  LEARNER_HOME,
  LEARNER_UID,
  STARTER_MARKER,
  WORK_DIR,
  WORKSPACE_MOUNT,
} from "../identity.js";

// Tar paths are relative to the volume root, because the archive is put at WORKSPACE_MOUNT. The root entry
// itself is never in the tar: the archive API skips "." of an existing mount root, which is what keeps the
// volume root (and so the marker) root-owned (design 5.3).
const HOME_ENTRY = `${posix.relative(WORKSPACE_MOUNT, LEARNER_HOME)}/`;
const WORK_ENTRY = `${posix.relative(WORKSPACE_MOUNT, WORK_DIR)}/`;
const MARKER_ENTRY = posix.relative(WORKSPACE_MOUNT, STARTER_MARKER);
const SCRATCH_ROOT_ENTRY = `${posix.relative(WORKSPACE_MOUNT, GRADER_SCRATCH_ROOT)}/`;

const DIRECTORY_MODE = 0o755;
/** Read-only for everyone and owned by root, so the learner can neither remove nor rewrite it (P5). */
const MARKER_MODE = 0o444;
const ROOT_ID = 0;
/** uid 1000 may pass through the scratch root but not list it (design 5.4). */
const SCRATCH_ROOT_MODE = 0o711;
/** Only the slot uid may enter its own directory. */
const SLOT_DIR_MODE = 0o700;

interface TarEntry {
  name: string;
  type: "directory" | "file";
  mode: number;
  uid: number;
  gid: number;
  content: Buffer;
}

function learnerEntry(
  name: string,
  type: TarEntry["type"],
  mode: number,
  content: Buffer,
): TarEntry {
  return { name, type, mode, uid: LEARNER_UID, gid: LEARNER_GID, content };
}

/** The entries in archive order: home, work, the starter in walk order, and the marker last. */
function starterTarEntries(items: readonly StarterItem[]): TarEntry[] {
  const empty = Buffer.alloc(0);
  const entries: TarEntry[] = [
    learnerEntry(HOME_ENTRY, "directory", DIRECTORY_MODE, empty),
    learnerEntry(WORK_ENTRY, "directory", DIRECTORY_MODE, empty),
  ];
  for (const item of items) {
    entries.push(
      item.kind === "directory"
        ? learnerEntry(`${WORK_ENTRY}${item.rel}/`, "directory", item.mode, empty)
        : learnerEntry(`${WORK_ENTRY}${item.rel}`, "file", item.mode, item.content ?? empty),
    );
  }
  // Last, so an interrupted copy never leaves a marker beside a partial starter (design 6.1 (c)).
  entries.push({
    name: MARKER_ENTRY,
    type: "file",
    mode: MARKER_MODE,
    uid: ROOT_ID,
    gid: ROOT_ID,
    content: empty,
  });
  return entries;
}

/**
 * The starter as one in-memory tar for `putArchive`: ownership and modes come from the headers, not from the
 * course files. `mtime` is passed in so the archive is a pure function of its inputs.
 */
export async function buildStarterTar(items: readonly StarterItem[], mtime: Date): Promise<Buffer> {
  return packEntries(starterTarEntries(items), mtime);
}

/**
 * A lesson's `checks/` as one in-memory tar, extracted by the check's own exec into its slot directory:
 * names relative to the checks directory, in walk order, uid and gid 0 (a tar run by another uid ignores
 * them), and modes normalised here too, so no caller can pass a setuid or group-write bit into the slot.
 */
export async function buildChecksTar(items: readonly ChecksItem[], mtime: Date): Promise<Buffer> {
  const empty = Buffer.alloc(0);
  const entries = items.map(
    (item): TarEntry => ({
      name: item.kind === "directory" ? `${item.rel}/` : item.rel,
      type: item.kind,
      mode: normalisedMode(item),
      uid: ROOT_ID,
      gid: ROOT_ID,
      content: item.kind === "file" ? (item.content ?? empty) : empty,
    }),
  );
  return packEntries(entries, mtime);
}

/**
 * The scratch root and one slot's directory, put at WORKSPACE_MOUNT before every check start (design 5.4).
 * It has no root entry, so the volume root stays root-owned, and every ancestor of the slot directory is then
 * root-owned. It depends on no state, so putting it again before the next start is harmless.
 */
export async function buildScratchTar(uid: number, mtime: Date): Promise<Buffer> {
  const empty = Buffer.alloc(0);
  return packEntries(
    [
      {
        name: SCRATCH_ROOT_ENTRY,
        type: "directory",
        mode: SCRATCH_ROOT_MODE,
        uid: ROOT_ID,
        gid: ROOT_ID,
        content: empty,
      },
      {
        name: `${SCRATCH_ROOT_ENTRY}${uid}/`,
        type: "directory",
        mode: SLOT_DIR_MODE,
        uid,
        gid: uid,
        content: empty,
      },
    ],
    mtime,
  );
}

async function packEntries(entries: readonly TarEntry[], mtime: Date): Promise<Buffer> {
  const archive = pack();
  for (const entry of entries) {
    const { content, ...header } = entry;
    archive.entry({ ...header, size: content.length, mtime }, content);
  }
  archive.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of archive) {
    const bytes: unknown = chunk;
    if (!(bytes instanceof Uint8Array))
      throw new TypeError("tar-stream produced a non-binary chunk");
    chunks.push(Buffer.from(bytes));
  }
  return Buffer.concat(chunks);
}
