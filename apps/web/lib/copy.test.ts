// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  type KeyHintPart,
  regionKeyHint,
  regionKeyHintMac,
  regionKeyHintMacParts,
  regionKeyHintParts,
} from "./copy";

// The key hint is rendered from its parts with nothing between them, so the hint's textContent is the joined
// parts; e2e/terminal.spec.ts compares that textContent with the string exactly.

function joined(parts: readonly KeyHintPart[]): string {
  return parts.map((part) => part.text).join("");
}

describe("key hint parts", () => {
  it("join to the key hint exactly", () => {
    expect(joined(regionKeyHintParts)).toBe(regionKeyHint);
  });

  it("join to the macOS key hint exactly", () => {
    expect(joined(regionKeyHintMacParts)).toBe(regionKeyHintMac);
  });
});
