// @vitest-environment node
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvalidRootEnvOptOutError, loadRootEnv, readRootEnvKeys } from "./root-env";

const tempDirs: string[] = [];
const canaryNames: string[] = [];

afterEach(() => {
  for (const name of canaryNames.splice(0)) delete process.env[name];
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function canaryEnvFile(): { file: string; name: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "root-env-"));
  tempDirs.push(dir);
  const name = `ACADEMY_ENV_CANARY_${randomBytes(6).toString("hex").toUpperCase()}`;
  canaryNames.push(name);
  const file = path.join(dir, ".env");
  writeFileSync(file, `${name}=1\n`);
  return { file, name };
}

describe("loadRootEnv", () => {
  it("skips the file and logs one line when the opt-out is 1", () => {
    const { file } = canaryEnvFile();
    const load = vi.fn();
    const log = vi.fn();

    const outcome = loadRootEnv({ env: { ACADEMY_SKIP_ROOT_ENV: "1" }, file, log, load });

    expect(load).not.toHaveBeenCalled();
    expect(outcome).toBe("skipped");
    expect(log.mock.calls).toEqual([["root .env not loaded: ACADEMY_SKIP_ROOT_ENV=1"]]);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("loads the file into process.env when the opt-out is %s", (_label, value) => {
    const { file, name } = canaryEnvFile();
    const log = vi.fn();

    const outcome = loadRootEnv({ env: { ACADEMY_SKIP_ROOT_ENV: value }, file, log });

    expect(outcome).toBe("loaded");
    expect(process.env[name]).toBe("1");
    expect(log).not.toHaveBeenCalled();
  });

  it("returns absent without loading when the file does not exist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "root-env-"));
    tempDirs.push(dir);
    const load = vi.fn();

    const outcome = loadRootEnv({ env: {}, file: path.join(dir, ".env"), log: vi.fn(), load });

    expect(outcome).toBe("absent");
    expect(load).not.toHaveBeenCalled();
  });

  it.each(["true", "0"])("refuses the value %s naming the variable and the value", (value) => {
    const { file } = canaryEnvFile();
    const load = vi.fn();

    const act = (): unknown =>
      loadRootEnv({ env: { ACADEMY_SKIP_ROOT_ENV: value }, file, log: vi.fn(), load });

    expect(act).toThrow(InvalidRootEnvOptOutError);
    expect(act).toThrow(`ACADEMY_SKIP_ROOT_ENV must be 1 or unset, got ${value}`);
    expect(load).not.toHaveBeenCalled();
  });

  it("prints only the length of a long value, never the value", () => {
    const { file } = canaryEnvFile();
    const value = "s".repeat(20) + "e".repeat(20);

    const act = (): unknown =>
      loadRootEnv({ env: { ACADEMY_SKIP_ROOT_ENV: value }, file, log: vi.fn(), load: vi.fn() });

    expect(act).toThrow("got <40 characters>");
    expect(act).not.toThrow(value);
  });
});

describe("readRootEnvKeys (#106 design 2.8)", () => {
  it("reads nothing when the opt-out is 1 (RK1)", () => {
    const { file } = canaryEnvFile();
    const read = vi.fn(() => "A=1\n");

    const keys = readRootEnvKeys({ env: { ACADEMY_SKIP_ROOT_ENV: "1" }, file, read });

    expect(keys).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("finds no names when the file does not exist (RK2)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "root-env-"));
    tempDirs.push(dir);

    expect(readRootEnvKeys({ env: {}, file: path.join(dir, ".env") })).toEqual([]);
  });

  it("returns the defined names only, comments left out (RK3)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "root-env-"));
    tempDirs.push(dir);
    const file = path.join(dir, ".env");
    writeFileSync(file, 'A=1\n# B=2\nC="x y"\n');

    expect(readRootEnvKeys({ env: {}, file })).toEqual(["A", "C"]);
  });
});

// Built from parts, so this file holds none of the strings it searches for.
const LOADER_NAME = ["loadEnv", "File"].join("");
const DOTENV_IMPORT = new RegExp(
  ["(from\\s*|require\\(\\s*|import\\(\\s*)['\"]", "dot", "env"].join(""),
);
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");
const REQUIRED_ROOTS = ["apps", "packages"];
// services/ has no tracked file yet, so a fresh checkout (CI) has no such directory.
const OPTIONAL_ROOTS = ["services"];
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
  "playwright-report",
  "test-results",
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) found.push(...sourceFiles(full));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      found.push(path.relative(REPOSITORY_ROOT, full));
    }
  }
  return found;
}

function visitedFiles(): string[] {
  const roots = [
    ...REQUIRED_ROOTS,
    ...OPTIONAL_ROOTS.filter((root) => existsSync(path.join(REPOSITORY_ROOT, root))),
  ];
  return roots.flatMap((root) => sourceFiles(path.join(REPOSITORY_ROOT, root)));
}

describe("root .env call sites", () => {
  it("has every required root in the repository", () => {
    const missing = REQUIRED_ROOTS.filter((root) => !existsSync(path.join(REPOSITORY_ROOT, root)));

    expect(missing).toEqual([]);
  });

  it("loads the root .env only through lib/root-env.ts and never through dotenv", () => {
    const visited = visitedFiles();
    const text = (file: string): string => readFileSync(path.join(REPOSITORY_ROOT, file), "utf8");

    const directLoaders = visited.filter(
      (file) => file !== "apps/web/lib/root-env.ts" && text(file).includes(LOADER_NAME),
    );
    const dotenvImports = visited.filter((file) => DOTENV_IMPORT.test(text(file)));

    expect(directLoaders).toEqual([]);
    expect(dotenvImports).toEqual([]);
    expect(visited).toContain("apps/web/next.config.ts");
    expect(visited).toContain("packages/db/src/vocabulary.ts");
  });

  it.each(["apps/web/next.config.ts", "apps/web/playwright.config.ts", "apps/web/scripts/seed.ts"])(
    "%s calls loadRootEnv",
    (file) => {
      const source = readFileSync(path.join(REPOSITORY_ROOT, file), "utf8");

      expect(source).toContain("loadRootEnv(");
    },
  );
});
