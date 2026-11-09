import fc from "fast-check";
import { extract, type Header } from "tar-stream";
import { describe, expect, it } from "vitest";
import type { StarterItem } from "../../../src/course/starter.js";
import { buildStarterTar } from "../../../src/docker/tar.js";

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
