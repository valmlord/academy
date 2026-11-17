import { execFileSync } from "node:child_process";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadChecks } from "../../../src/course/checks.js";
import { ChecksRefusedError } from "../../../src/errors.js";

const FIXTURE = fileURLToPath(new URL("../../fixtures/course", import.meta.url));
const FIXTURE_LESSON = "sample-course/01-basics/01-with-workspace";
const LESSON_DIR = "lesson";
const CHECKS_REL = `${LESSON_DIR}/checks`;

let root: string;
let checks: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wks-checks-"));
  await mkdir(join(root, LESSON_DIR));
  checks = join(root, CHECKS_REL);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** The refusal, or `null` when the load resolved, so the assertion itself reports an accepted directory. */
async function refusalOf(load: Promise<unknown>): Promise<ChecksRefusedError | null> {
  try {
    await load;
  } catch (error) {
    if (error instanceof ChecksRefusedError) return error;
    throw error;
  }
  return null;
}

describe("loadChecks", () => {
  it("reads the fixture checks with their normalised mode and bytes", async () => {
    const expected = await readFile(join(FIXTURE, FIXTURE_LESSON, "checks/verify.sh"));

    const items = await loadChecks(FIXTURE, FIXTURE_LESSON);

    expect(items).toEqual([{ rel: "verify.sh", kind: "file", mode: 0o755, content: expected }]);
  });

  it("lists each directory before its contents, names sorted", async () => {
    await mkdir(join(checks, "data"), { recursive: true });
    await writeFile(join(checks, "data/key.json"), "{}");
    await writeFile(join(checks, "b.py"), "b");
    await writeFile(join(checks, "a.py"), "a");

    const items = await loadChecks(root, LESSON_DIR);

    expect(items.map((item) => [item.rel, item.kind, item.mode])).toEqual([
      ["a.py", "file", 0o644],
      ["b.py", "file", 0o644],
      ["data", "directory", 0o755],
      ["data/key.json", "file", 0o644],
    ]);
  });

  it("refuses a symlink inside checks/ with reason symlink", async () => {
    await mkdir(checks);
    await writeFile(join(root, "elsewhere.txt"), "x");
    await symlink(join(root, "elsewhere.txt"), join(checks, "linked.txt"));

    const refusal = await refusalOf(loadChecks(root, LESSON_DIR));

    expect(refusal).toBeInstanceOf(ChecksRefusedError);
    expect(refusal?.reason).toBe("symlink");
    expect(refusal?.path).toBe(`${CHECKS_REL}/linked.txt`);
  });

  it("refuses a symlinked checks directory with reason symlink", async () => {
    await mkdir(join(root, "real-checks"));
    await symlink(join(root, "real-checks"), checks);

    const refusal = await refusalOf(loadChecks(root, LESSON_DIR));

    expect(refusal).toBeInstanceOf(ChecksRefusedError);
    expect(refusal?.reason).toBe("symlink");
    expect(refusal?.path).toBe(CHECKS_REL);
  });

  it("refuses a hard-linked file with reason hard-link, without its content in the message", async () => {
    const canary = `canary-${Date.now()}`;
    await mkdir(checks);
    await writeFile(join(checks, "answer.txt"), canary);
    await link(join(checks, "answer.txt"), join(root, "second-name.txt"));

    const refusal = await refusalOf(loadChecks(root, LESSON_DIR));

    expect(refusal).toBeInstanceOf(ChecksRefusedError);
    expect(refusal?.reason).toBe("hard-link");
    expect(refusal?.path).toBe(`${CHECKS_REL}/answer.txt`);
    expect(refusal?.message).toBe(`checks refused: ${CHECKS_REL}/answer.txt: hard-link`);
    expect(refusal?.message).not.toContain(canary);
  });

  it("refuses a lesson without a checks directory with reason missing", async () => {
    const refusal = await refusalOf(loadChecks(root, LESSON_DIR));

    expect(refusal).toBeInstanceOf(ChecksRefusedError);
    expect(refusal?.reason).toBe("missing");
    expect(refusal?.path).toBe(CHECKS_REL);
  });

  it("refuses a FIFO inside checks/ with reason special-file", async () => {
    await mkdir(checks);
    await writeFile(join(checks, "verify.sh"), "exit 0\n");
    execFileSync("mkfifo", [join(checks, "pipe")]);

    const refusal = await refusalOf(loadChecks(root, LESSON_DIR));

    expect(refusal).toBeInstanceOf(ChecksRefusedError);
    expect(refusal?.reason).toBe("special-file");
    expect(refusal?.path).toBe(`${CHECKS_REL}/pipe`);
  }, 2_000);

  it("refuses a checks entry that is a regular file with reason not-a-directory", async () => {
    await writeFile(checks, "not a directory\n");

    const refusal = await refusalOf(loadChecks(root, LESSON_DIR));

    expect(refusal).toBeInstanceOf(ChecksRefusedError);
    expect(refusal?.reason).toBe("not-a-directory");
    expect(refusal?.path).toBe(CHECKS_REL);
  });

  it("refuses checks over the byte cap with reason too-large", async () => {
    await mkdir(checks);
    await writeFile(join(checks, "big.txt"), "x".repeat(11));

    const refusal = await refusalOf(
      loadChecks(root, LESSON_DIR, { maxBytes: 10, maxEntries: 1_000 }),
    );

    expect(refusal).toBeInstanceOf(ChecksRefusedError);
    expect(refusal?.reason).toBe("too-large");
  });

  it("refuses checks over the entry cap with reason too-large", async () => {
    await mkdir(checks);
    for (const name of ["a.txt", "b.txt", "c.txt"]) await writeFile(join(checks, name), "x");

    const refusal = await refusalOf(
      loadChecks(root, LESSON_DIR, { maxBytes: 1024 * 1024, maxEntries: 2 }),
    );

    expect(refusal).toBeInstanceOf(ChecksRefusedError);
    expect(refusal?.reason).toBe("too-large");
  });

  it("accepts checks whose bytes equal the byte cap", async () => {
    await mkdir(checks);
    await writeFile(join(checks, "exact.txt"), "x".repeat(10));

    const refusal = await refusalOf(
      loadChecks(root, LESSON_DIR, { maxBytes: 10, maxEntries: 1_000 }),
    );

    expect(refusal).toBeNull();
  });

  it("accepts checks whose entries equal the entry cap", async () => {
    await mkdir(checks);
    for (const name of ["a.txt", "b.txt"]) await writeFile(join(checks, name), "x");

    const refusal = await refusalOf(
      loadChecks(root, LESSON_DIR, { maxBytes: 1024 * 1024, maxEntries: 2 }),
    );

    expect(refusal).toBeNull();
  });
});
