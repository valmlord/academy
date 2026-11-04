import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCourseFile } from "../../../src/course/files.js";
import { parseYamlFile } from "../../../src/course/yaml.js";
import { CourseReadError } from "../../../src/errors.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wks-files-"));
  await mkdir(join(root, "real", "lesson"), { recursive: true });
  await writeFile(join(root, "real", "lesson", "lesson.yaml"), "id: one\n");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function refusal(rel: string, base: string = root): Promise<CourseReadError> {
  try {
    await readCourseFile(base, rel);
  } catch (error) {
    if (error instanceof CourseReadError) return error;
    throw error;
  }
  throw new Error(`readCourseFile accepted ${rel}`);
}

describe("readCourseFile", () => {
  it("reads a regular file below the root", async () => {
    await expect(readCourseFile(root, "real/lesson/lesson.yaml")).resolves.toBe("id: one\n");
  });

  it("refuses a symlinked directory segment, naming that segment", async () => {
    await symlink(join(root, "real"), join(root, "link"));

    const error = await refusal("link/lesson/lesson.yaml");

    expect({ file: error.file, reason: error.reason }).toEqual({ file: "link", reason: "symlink" });
  });

  it("refuses a symlink deeper below the root", async () => {
    await symlink(join(root, "real", "lesson"), join(root, "real", "alias"));

    const error = await refusal("real/alias/lesson.yaml");

    expect({ file: error.file, reason: error.reason }).toEqual({
      file: "real/alias",
      reason: "symlink",
    });
  });

  it("refuses a symlinked file", async () => {
    await symlink(join(root, "real", "lesson", "lesson.yaml"), join(root, "real", "linked.yaml"));

    expect((await refusal("real/linked.yaml")).reason).toBe("symlink");
  });

  it("refuses a FIFO as a non-regular file without opening it", async () => {
    execFileSync("mkfifo", [join(root, "real", "pipe.yaml")]);

    expect((await refusal("real/pipe.yaml")).reason).toBe("not-a-regular-file");
  });

  it("refuses a directory as a non-regular file", async () => {
    expect((await refusal("real/lesson")).reason).toBe("not-a-regular-file");
  });

  it("names a missing file relative to the root, never the absolute path", async () => {
    const error = await refusal("real/lesson/missing.yaml");

    expect({ file: error.file, reason: error.reason }).toEqual({
      file: "real/lesson/missing.yaml",
      reason: "missing",
    });
    expect(error.message).not.toContain(root);
  });

  it("names a missing root as .", async () => {
    const error = await refusal("course.yaml", join(root, "absent"));

    expect({ file: error.file, reason: error.reason }).toEqual({ file: ".", reason: "missing" });
  });

  it.each(["../outside.yaml", "real/./lesson/lesson.yaml", "real//lesson.yaml", ""])(
    "refuses the path %j as invalid",
    async (rel) => {
      expect((await refusal(rel)).reason).toBe("invalid-path");
    },
  );
});

describe("parseYamlFile", () => {
  it("returns the parsed value", () => {
    expect(parseYamlFile("id: one\nlist: [a, b]\n", "x.yaml")).toEqual({
      id: "one",
      list: ["a", "b"],
    });
  });

  it("fails closed on a warning, naming the line and never the source text", () => {
    const text = "id: one\nsecret-canary: !unknown-tag value\n";

    expect(() => parseYamlFile(text, "x.yaml")).toThrow(
      new CourseReadError("x.yaml", "invalid YAML at line 2"),
    );
  });

  it("fails on a second document", () => {
    expect(() => parseYamlFile("id: one\n---\nid: two\n", "x.yaml")).toThrow(CourseReadError);
  });
});
