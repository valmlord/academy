// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readStandaloneConfig, StandaloneConfigError } from "./config-file.ts";
import { CONFIG_MISSING, CONFIG_NO_OBJECT, CONFIG_NOT_JSON } from "./strings.ts";

// U-config-file (#32 design 3.1 step 1, 3.8 F2).

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function buildDir(contents: string | undefined): string {
  const dir = mkdtempSync(path.join(tmpdir(), "t32-config-"));
  dirs.push(dir);
  if (contents !== undefined) {
    mkdirSync(path.join(dir, ".next"));
    writeFileSync(path.join(dir, ".next", "required-server-files.json"), contents);
  }
  return dir;
}

async function failure(dir: string): Promise<unknown> {
  try {
    await readStandaloneConfig(dir);
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected a StandaloneConfigError");
}

describe("readStandaloneConfig (U-config-file)", () => {
  it.each([
    ["the file is missing", undefined, CONFIG_MISSING],
    ["the file is not JSON", "{ canary", CONFIG_NOT_JSON],
    ["the file is a JSON array", "[1]", CONFIG_NO_OBJECT],
    ["config is not an object", '{"config": 1}', CONFIG_NO_OBJECT],
    ["config is an array", '{"config": []}', CONFIG_NO_OBJECT],
    ["there is no config", '{"version": 1}', CONFIG_NO_OBJECT],
  ])("throws StandaloneConfigError when %s", async (_case, contents, message) => {
    const error = await failure(buildDir(contents));

    expect(error).toBeInstanceOf(StandaloneConfigError);
    expect(error instanceof Error ? error.message : "").toBe(message);
  });

  it("returns the config object as JSON", async () => {
    const dir = buildDir('{"version": 1, "config": {"distDir": "./.next", "env": {}}}');

    expect(await readStandaloneConfig(dir)).toBe('{"distDir":"./.next","env":{}}');
  });
});
