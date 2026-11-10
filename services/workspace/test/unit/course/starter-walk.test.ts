import { execFileSync } from "node:child_process";
import { cp, link, mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCourseLessons } from "../../../src/course/lessons.js";
import {
  MAX_STARTER_BYTES,
  MAX_STARTER_ENTRIES,
  resolveStarter,
  walkStarter,
} from "../../../src/course/starter.js";
import { StarterRefusedError, StarterTooLargeError } from "../../../src/errors.js";

const FIXTURE = fileURLToPath(new URL("../../fixtures/course", import.meta.url));
const REAL_COURSE = fileURLToPath(new URL("../../../../../course", import.meta.url));
const LESSON = "sample-course/01-basics/01-with-workspace";

let root: string;
let starterPath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wks-walk-"));
  await cp(FIXTURE, root, { recursive: true });
  starterPath = join(root, LESSON, "starter");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function walk(): ReturnType<typeof walkStarter> {
  return walkStarter(await resolveStarter(root, LESSON, "starter"));
}

async function refusal(): Promise<StarterRefusedError> {
  try {
    await walk();
  } catch (error) {
    if (error instanceof StarterRefusedError) return error;
    throw error;
  }
  throw new Error("walkStarter accepted the starter");
}

async function tooLarge(): Promise<StarterTooLargeError> {
  try {
    await walk();
  } catch (error) {
    if (error instanceof StarterTooLargeError) return error;
    throw error;
  }
  throw new Error("walkStarter accepted the starter");
}

async function freshStarter(files: number): Promise<void> {
  await rm(starterPath, { recursive: true });
  await mkdir(starterPath);
  for (let index = 0; index < files; index += 1) {
    await writeFile(join(starterPath, `f${index}`), "");
  }
}

describe("walkStarter", () => {
  it("walks in a stable order with dotfiles, each directory before its contents", async () => {
    const entries = await walk();

    expect(entries.map(({ rel, kind }) => `${kind} ${rel}`)).toEqual([
      "file .config-note",
      "file README.md",
      "directory src",
      "directory src/lib",
      "file src/lib/util.txt",
      "file src/main.sh",
    ]);
  });

  it("refuses a symlink inside the tree", async () => {
    await symlink("README.md", join(starterPath, "alias.md"));

    const error = await refusal();

    expect({ path: error.path, reason: error.reason }).toEqual({
      path: `${LESSON}/starter/alias.md`,
      reason: "symlink",
    });
  });

  it("refuses a hard link to a file in another lesson's checks/ as hard-link", async () => {
    const otherChecks = join(root, "sample-course/01-basics/03-other/checks");
    await mkdir(otherChecks, { recursive: true });
    await writeFile(join(otherChecks, "answer.sh"), "echo secret\n");
    await link(join(otherChecks, "answer.sh"), join(starterPath, "answer.sh"));

    const error = await refusal();

    expect({ path: error.path, reason: error.reason }).toEqual({
      path: `${LESSON}/starter/answer.sh`,
      reason: "hard-link",
    });
  });

  it("refuses a hard link to this lesson's grader material as grader-file", async () => {
    await link(join(root, LESSON, "quiz.yaml"), join(starterPath, "notes.yaml"));

    expect((await refusal()).reason).toBe("grader-file");
  });

  it("refuses a FIFO as special-file", async () => {
    execFileSync("mkfifo", [join(starterPath, "pipe")]);

    expect((await refusal()).reason).toBe("special-file");
  });

  it(`accepts ${MAX_STARTER_ENTRIES} entries and refuses one more`, async () => {
    await freshStarter(MAX_STARTER_ENTRIES);
    expect(await walk()).toHaveLength(MAX_STARTER_ENTRIES);

    await writeFile(join(starterPath, "one-more"), "");

    expect((await tooLarge()).limit).toBe(`${MAX_STARTER_ENTRIES} entries`);
  });

  it("refuses a starter over the byte cap from lstat sizes, before reading", async () => {
    await truncate(join(starterPath, "README.md"), MAX_STARTER_BYTES + 1);

    expect((await tooLarge()).limit).toBe(`${MAX_STARTER_BYTES} bytes`);
  });
});

describe("real course guard", () => {
  it("walks every starter of the course without a refusal", async () => {
    const course = await readCourseLessons(REAL_COURSE);
    const withWorkspace = course.all().filter((lesson) => lesson.workspace !== null);

    expect(withWorkspace.length).toBeGreaterThan(0);
    for (const lesson of withWorkspace) {
      const starter = lesson.workspace?.starter ?? "";
      const entries = await walkStarter(
        await resolveStarter(REAL_COURSE, lesson.lessonDir, starter),
      );
      expect(entries.length).toBeGreaterThan(0);
    }
  });
});
