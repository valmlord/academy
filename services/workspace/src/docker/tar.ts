import { posix } from "node:path";
import { pack } from "tar-stream";
import type { StarterItem } from "../course/starter.js";
import {
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

const DIRECTORY_MODE = 0o755;
/** Read-only for everyone and owned by root, so the learner can neither remove nor rewrite it (P5). */
const MARKER_MODE = 0o444;
const ROOT_ID = 0;

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
  const archive = pack();
  for (const entry of starterTarEntries(items)) {
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
