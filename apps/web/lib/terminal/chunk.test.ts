// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { chunkInput } from "./chunk";

// U-chunk (design 10.3): terminal input split into `input` frames the service accepts (1..8192 UTF-16 units).

const MAX_UNITS = 8192;

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

describe("chunkInput (U-chunk)", () => {
  it("joins back to the input, with chunks of 1..8192 units, none starting with a low surrogate", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 30_000 }), (text) => {
        const chunks = chunkInput(text);

        expect(chunks.join("")).toBe(text);
        for (const chunk of chunks) {
          expect(chunk.length).toBeGreaterThanOrEqual(1);
          expect(chunk.length).toBeLessThanOrEqual(MAX_UNITS);
          expect(isLowSurrogate(chunk.charCodeAt(0))).toBe(false);
        }
      }),
    );
  });

  it("keeps the same properties for any chunk size of at least 2, where cuts meet pairs often", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "binary", maxLength: 200 }),
        fc.integer({ min: 2, max: 16 }),
        (text, maxUnits) => {
          const chunks = chunkInput(text, maxUnits);

          expect(chunks.join("")).toBe(text);
          for (const chunk of chunks) {
            expect(chunk.length).toBeGreaterThanOrEqual(1);
            expect(chunk.length).toBeLessThanOrEqual(maxUnits);
            expect(isLowSurrogate(chunk.charCodeAt(0))).toBe(false);
          }
        },
      ),
    );
  });

  it("moves a cut that would split a surrogate pair one unit back", () => {
    const text = `${"a".repeat(MAX_UNITS - 1)}😀b`;

    const chunks = chunkInput(text);

    expect(chunks).toEqual(["a".repeat(MAX_UNITS - 1), "😀b"]);
  });

  it("returns no chunk for empty input", () => {
    expect(chunkInput("")).toEqual([]);
  });
});
