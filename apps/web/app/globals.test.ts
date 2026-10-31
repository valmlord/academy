// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const startMarker = "/* design-tokens:start */";
const endMarker = "/* design-tokens:end */";

// ADR-0006 item 1: dev copies design/system/tokens.css verbatim into globals.css between the markers.
const recopyProcedure =
  "re-copy design/system/tokens.css between the design-tokens markers of apps/web/app/globals.css " +
  "via a dev HOTFIX branch cut from the DESIGN branch (README, Web app: re-copy of the token block)";

// Read at test time, never imported: the app must not depend on design/ at runtime (ADR-0006 item 3).
const repositoryRoot = path.join(import.meta.dirname, "../../..");
const globalsCss = readFileSync(path.join(import.meta.dirname, "globals.css"), "utf8");
const tokensCss = readFileSync(path.join(repositoryRoot, "design/system/tokens.css"), "utf8");

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("app/globals.css", () => {
  it("carries design/system/tokens.css verbatim between the token markers", () => {
    expect(occurrences(globalsCss, startMarker), "start markers").toBe(1);
    expect(occurrences(globalsCss, endMarker), "end markers").toBe(1);
    const start = globalsCss.indexOf(startMarker);
    const end = globalsCss.indexOf(endMarker);
    expect(start, "start marker before end marker").toBeLessThan(end);

    const block = globalsCss.slice(start + startMarker.length, end);
    expect(block.startsWith("\n") && block.endsWith("\n"), "newline after start, before end").toBe(
      true,
    );
    expect(block.slice(1, -1) === tokensCss, `token block drifted: ${recopyProcedure}`).toBe(true);

    const beforeBlock = globalsCss.slice(0, start).replace(/\/\*[\s\S]*?\*\//g, "");
    const unexpectedLines = beforeBlock
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.startsWith("@import "));
    expect(
      unexpectedLines,
      "only @import lines, blank lines and comments precede the block",
    ).toEqual([]);
  });
});
