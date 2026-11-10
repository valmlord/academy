import { chmod, cp, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadStarter,
  normalisedMode,
  readStarterFile,
  resolveStarter,
  type StarterEntry,
  walkStarter,
} from "../../../src/course/starter.js";
import { StarterRefusedError } from "../../../src/errors.js";

const FIXTURE = fileURLToPath(new URL("../../fixtures/course", import.meta.url));
const LESSON = "sample-course/01-basics/01-with-workspace";

let root: string;
let starterPath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wks-read-"));
  await cp(FIXTURE, root, { recursive: true });
  starterPath = join(root, LESSON, "starter");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Walks the starter, lets the test change the tree, then reads the walked README entry. */
async function readReadmeAfter(change: () => Promise<void>): Promise<StarterRefusedError> {
  const resolved = await resolveStarter(root, LESSON, "starter");
  const entries = await walkStarter(resolved);
  const readme = entries.find((entry) => entry.rel === "README.md");
  if (readme === undefined) throw new Error("fixture has no README.md");
  await change();
  try {
    await readStarterFile(resolved, readme);
  } catch (error) {
    if (error instanceof StarterRefusedError) return error;
    throw error;
  }
  throw new Error("readStarterFile read the changed file");
}

describe("readStarterFile", () => {
  it("refuses a file swapped for a symlink between walk and read", async () => {
    const readme = join(starterPath, "README.md");
    const decoy = join(root, "decoy.md");

    const error = await readReadmeAfter(async () => {
      await writeFile(decoy, "x".repeat(41));
      await rm(readme);
      await symlink(decoy, readme);
    });

    expect({ path: error.path, reason: error.reason }).toEqual({
      path: `${LESSON}/starter/README.md`,
      reason: "changed-during-read",
    });
  });

  it("refuses a file replaced by another regular file between walk and read", async () => {
    const readme = join(starterPath, "README.md");

    const error = await readReadmeAfter(async () => {
      await writeFile(join(starterPath, "other.md"), "# Starter\n\nEdit the files under src/.\n");
      await rename(join(starterPath, "other.md"), readme);
    });

    expect(error.reason).toBe("changed-during-read");
  });
});

describe("loadStarter", () => {
  it("reads every file's bytes and normalises modes, keeping the execute bit", async () => {
    const items = await loadStarter(root, LESSON, "starter");

    expect(
      items.map(({ rel, kind, mode, content }) => ({
        rel,
        kind,
        mode: mode.toString(8),
        content: content?.toString("utf8") ?? null,
      })),
    ).toEqual([
      { rel: ".config-note", kind: "file", mode: "644", content: "editor=plain\n" },
      {
        rel: "README.md",
        kind: "file",
        mode: "644",
        content: "# Starter\n\nEdit the files under src/.\n",
      },
      { rel: "src", kind: "directory", mode: "755", content: null },
      { rel: "src/lib", kind: "directory", mode: "755", content: null },
      { rel: "src/lib/util.txt", kind: "file", mode: "644", content: "helper text\n" },
      { rel: "src/main.sh", kind: "file", mode: "755", content: "#!/bin/sh\necho starter\n" },
    ]);
  });

  it("keeps any execute bit and drops every other permission detail", async () => {
    await chmod(join(starterPath, "README.md"), 0o710);
    await chmod(join(starterPath, ".config-note"), 0o600);

    const items = await loadStarter(root, LESSON, "starter");
    const modeOf = (rel: string): string =>
      items.find((item) => item.rel === rel)?.mode.toString(8) ?? "";

    expect([modeOf("README.md"), modeOf(".config-note")]).toEqual(["755", "644"]);
  });
});

describe("normalisedMode", () => {
  it.each<[StarterEntry["kind"], number, number]>([
    ["directory", 0o700, 0o755],
    ["file", 0o100664, 0o644],
    ["file", 0o100701, 0o755],
  ])("maps a %s with mode %o to %o", (kind, mode, expected) => {
    expect(normalisedMode({ kind, mode })).toBe(expected);
  });
});
