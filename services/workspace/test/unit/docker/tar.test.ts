import fc from "fast-check";
import { extract, type Header } from "tar-stream";
import { describe, expect, it } from "vitest";
import type { ChecksItem } from "../../../src/course/checks.js";
import type { StarterItem } from "../../../src/course/starter.js";
import { buildChecksTar, buildScratchTar, buildStarterTar } from "../../../src/docker/tar.js";

const MTIME = new Date(Date.UTC(2026, 10, 3));

interface Extracted {
  header: Header;
  content: Buffer;
}

async function extractAll(tar: Buffer): Promise<Extracted[]> {
  const extractor = extract();
  const entries: Extracted[] = [];
  const reading = (async () => {
    for await (const entry of extractor) {
      const chunks: Buffer[] = [];
      for await (const chunk of entry) {
        const bytes: unknown = chunk;
        if (!(bytes instanceof Uint8Array)) throw new TypeError("non-binary tar chunk");
        chunks.push(Buffer.from(bytes));
      }
      entries.push({ header: entry.header, content: Buffer.concat(chunks) });
    }
  })();
  extractor.end(tar);
  await reading;
  return entries;
}

const file = (rel: string, mode: number, text: string): StarterItem => ({
  rel,
  kind: "file",
  mode,
  content: Buffer.from(text),
});
const directory = (rel: string): StarterItem => ({
  rel,
  kind: "directory",
  mode: 0o755,
  content: null,
});

describe("buildStarterTar", () => {
  it("writes home, work, the starter under work and the marker last, with ownership and modes", async () => {
    const items = [
      file("README.md", 0o644, "read me"),
      directory("src"),
      file("src/main.sh", 0o755, "#!/bin/sh\n"),
    ];

    const entries = await extractAll(await buildStarterTar(items, MTIME));

    expect(
      entries.map(({ header }) => [
        header.name,
        header.type,
        header.mode.toString(8),
        header.uid,
        header.gid,
      ]),
    ).toEqual([
      ["home/", "directory", "755", 1000, 1000],
      ["home/work/", "directory", "755", 1000, 1000],
      ["home/work/README.md", "file", "644", 1000, 1000],
      ["home/work/src/", "directory", "755", 1000, 1000],
      ["home/work/src/main.sh", "file", "755", 1000, 1000],
      [".starter-complete", "file", "444", 0, 0],
    ]);
    expect(entries.every(({ header }) => header.mtime.getTime() === MTIME.getTime())).toBe(true);
  });

  it("is padded to whole 512-byte blocks", async () => {
    const tar = await buildStarterTar([file("a.txt", 0o644, "x".repeat(700))], MTIME);

    expect(tar.length % 512).toBe(0);
  });

  it("round-trips the bytes and modes of any set of files", async () => {
    const files = fc.uniqueArray(
      fc.record({
        name: fc.stringMatching(/^[a-z0-9_-][a-z0-9._-]{0,20}$/),
        content: fc.uint8Array({ maxLength: 3000 }),
        executable: fc.boolean(),
      }),
      { selector: (entry) => entry.name, maxLength: 12 },
    );

    await fc.assert(
      fc.asyncProperty(files, async (generated) => {
        const items: StarterItem[] = generated.map(({ name, content, executable }) => ({
          rel: `nested/${name}`,
          kind: "file",
          mode: executable ? 0o755 : 0o644,
          content: Buffer.from(content),
        }));

        const entries = await extractAll(
          await buildStarterTar([directory("nested"), ...items], MTIME),
        );
        const files = entries.filter(({ header }) => header.name.startsWith("home/work/nested/"));

        expect(
          files
            .filter(({ header }) => header.type === "file")
            .map(({ header, content }) => ({
              rel: header.name.slice("home/work/".length),
              mode: header.mode,
              content,
            })),
        ).toEqual(items.map(({ rel, mode, content }) => ({ rel, mode, content })));
        expect(entries.at(-1)?.header.name).toBe(".starter-complete");
      }),
      { numRuns: 50 },
    );
  });
});

describe("buildChecksTar", () => {
  const items: ChecksItem[] = [
    directory("data"),
    file("data/key.json", 0o600, "{}"),
    directory("data/nested"),
    file("data/nested/run.sh", 0o700, "#!/bin/sh\n"),
    file("verify.py", 0o4755, "print()\n"),
  ];

  it("names entries relative to the checks directory, each directory before its contents", async () => {
    const entries = await extractAll(await buildChecksTar(items, MTIME));

    expect(entries.map(({ header }) => [header.name, header.type])).toEqual([
      ["data/", "directory"],
      ["data/key.json", "file"],
      ["data/nested/", "directory"],
      ["data/nested/run.sh", "file"],
      ["verify.py", "file"],
    ]);
    for (const { header } of entries) {
      expect(header.name.startsWith("/")).toBe(false);
      expect(header.name.split("/")).not.toContain("..");
    }
  });

  it("writes normalised modes owned by root", async () => {
    const entries = await extractAll(await buildChecksTar(items, MTIME));

    expect(entries.map(({ header }) => [header.mode.toString(8), header.uid, header.gid])).toEqual([
      ["755", 0, 0],
      ["644", 0, 0],
      ["755", 0, 0],
      ["755", 0, 0],
      ["755", 0, 0],
    ]);
  });

  it("round-trips the bytes of any set of files", async () => {
    const files = fc.uniqueArray(
      fc.record({
        name: fc.stringMatching(/^[a-z0-9_-][a-z0-9._-]{0,20}$/),
        content: fc.uint8Array({ maxLength: 3000 }),
        executable: fc.boolean(),
      }),
      { selector: (entry) => entry.name, maxLength: 12 },
    );

    await fc.assert(
      fc.asyncProperty(files, async (generated) => {
        const generatedItems: ChecksItem[] = generated.map(({ name, content, executable }) => ({
          rel: `data/${name}`,
          kind: "file",
          mode: executable ? 0o755 : 0o644,
          content: Buffer.from(content),
        }));

        const entries = await extractAll(
          await buildChecksTar([directory("data"), ...generatedItems], MTIME),
        );

        expect(
          entries
            .filter(({ header }) => header.type === "file")
            .map(({ header, content }) => ({ rel: header.name, mode: header.mode, content })),
        ).toEqual(generatedItems.map(({ rel, mode, content }) => ({ rel, mode, content })));
      }),
      { numRuns: 50 },
    );
  });
});

describe("buildScratchTar", () => {
  it("holds exactly the root-owned scratch root and the slot directory, and no root entry", async () => {
    const entries = await extractAll(await buildScratchTar(2003, MTIME));

    expect(
      entries.map(({ header }) => [
        header.name,
        header.type,
        header.mode.toString(8),
        header.uid,
        header.gid,
      ]),
    ).toEqual([
      [".academy-grader/", "directory", "711", 0, 0],
      [".academy-grader/2003/", "directory", "700", 2003, 2003],
    ]);
    expect(entries.every(({ header }) => header.mtime.getTime() === MTIME.getTime())).toBe(true);
  });
});
