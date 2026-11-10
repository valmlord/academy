import { access, cp, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isHiddenSegment, isSameEntry, resolveStarter } from "../../../src/course/starter.js";
import { StarterRefusedError } from "../../../src/errors.js";

const FIXTURE = fileURLToPath(new URL("../../fixtures/course", import.meta.url));
const LESSON = "sample-course/01-basics/01-with-workspace";

/** Whether the temp directory's filesystem treats names that differ only in case as one name. */
async function tempIsCaseInsensitive(): Promise<boolean> {
  const dir = await mkdtemp(join(tmpdir(), "wks-case-"));
  try {
    await writeFile(join(dir, "case-probe"), "");
    return await access(join(dir, "CASE-PROBE")).then(
      () => true,
      () => false,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const caseInsensitive = await tempIsCaseInsensitive();

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wks-starter-"));
  await cp(FIXTURE, root, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function refusal(starter: string, lessonDir: string = LESSON): Promise<StarterRefusedError> {
  try {
    await resolveStarter(root, lessonDir, starter);
  } catch (error) {
    if (error instanceof StarterRefusedError) return error;
    throw error;
  }
  throw new Error(`resolveStarter accepted ${starter}`);
}

describe("resolveStarter", () => {
  it("resolves the lesson's starter directory", async () => {
    const resolved = await resolveStarter(root, LESSON, "starter");

    expect(resolved.starterDir).toBe(`${LESSON}/starter`);
    expect(resolved.starterPath).toBe(join(root, LESSON, "starter"));
    expect(resolved.checks).not.toBeNull();
  });

  it.each([
    [".", "dot-path"],
    ["a//b", "dot-path"],
    ["./checks", "hidden-dir"],
    ["checks", "hidden-dir"],
    ["a/checks", "hidden-dir"],
    ["starter/../checks", "hidden-dir"],
    ["starter/..", "outside-lesson"],
  ])("refuses the starter path %j by its text as %s", async (starter, reason) => {
    expect((await refusal(starter)).reason).toBe(reason);
  });

  it("refuses a starter that is a symlink to checks as symlink, before the identity rule", async () => {
    await symlink(join(root, LESSON, "checks"), join(root, LESSON, "s"));

    const error = await refusal("s");

    expect({ path: error.path, reason: error.reason }).toEqual({
      path: `${LESSON}/s`,
      reason: "symlink",
    });
  });

  it("refuses a lesson directory reached through a symlink", async () => {
    const real = join(root, "moved-lesson");
    await rename(join(root, LESSON), real);
    await symlink(real, join(root, LESSON));

    expect((await refusal("starter")).reason).toBe("symlink");
  });

  it("refuses a missing starter as missing", async () => {
    expect((await refusal("absent")).reason).toBe("missing");
  });

  it("refuses a starter that is a file as not-a-directory", async () => {
    expect((await refusal("lesson.yaml")).reason).toBe("not-a-directory");
  });

  it.runIf(caseInsensitive)(
    "refuses the case variant Checks of an existing checks/ on disk",
    async () => {
      const error = await refusal("Checks");

      expect(error.reason).toBe("hidden-dir");
      console.log("case-variant ran");
    },
  );
});

// Code points instead of literals or escapes, so the source stays pure ASCII through the formatter.
const char = (codePoint: number): string => String.fromCodePoint(codePoint);

describe("folded name (rule 4a), every OS", () => {
  it.each([
    ["Checks", "Checks"],
    ["CHECKS", "CHECKS"],
    ["KELVIN SIGN", `chec${char(0x212a)}s`],
    ["fullwidth", [0xff43, 0xff48, 0xff45, 0xff43, 0xff4b, 0xff53].map(char).join("")],
    ["LONG S", `check${char(0x017f)}`],
    ["ZERO WIDTH JOINER", `che${char(0x200d)}cks`],
    ["SOFT HYPHEN", `che${char(0x00ad)}cks`],
  ])("refuses the %s spelling", async (_spelling, segment) => {
    expect(isHiddenSegment(segment)).toBe(true);
    expect((await refusal(`starter/${segment}`)).reason).toBe("hidden-dir");
  });

  it.each(["checks-old", "check", "mychecks", "starter"])("accepts %s", (segment) => {
    expect(isHiddenSegment(segment)).toBe(false);
  });
});

describe("entry identity (rule 4b)", () => {
  it("treats two names with one (dev, ino) as the same entry", () => {
    expect(
      isSameEntry({ name: "starter", dev: 1n, ino: 5n }, { name: "checks", dev: 1n, ino: 5n }),
    ).toBe(true);
  });

  it("treats one name with two inodes as different entries", () => {
    expect(
      isSameEntry({ name: "checks", dev: 1n, ino: 5n }, { name: "checks", dev: 1n, ino: 6n }),
    ).toBe(false);
  });
});
