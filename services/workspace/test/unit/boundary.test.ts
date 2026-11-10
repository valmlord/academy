import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Walks `src/` on disk rather than an import graph, so a new file nobody imports yet is checked too.
const SRC = fileURLToPath(new URL("../../src", import.meta.url));
const ENGINE = "docker/engine.ts";
const IMPORTS_DOCKERODE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']dockerode["']/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

describe("dockerode boundary", () => {
  it("is imported by src/docker/engine.ts and by no other file under src/", () => {
    const importers = sourceFiles(SRC)
      .filter((path) => IMPORTS_DOCKERODE.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path));

    expect(importers).toEqual([ENGINE]);
  });
});
