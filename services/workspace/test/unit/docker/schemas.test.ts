import { describe, expect, it } from "vitest";
import { describeIssuePath } from "../../../src/docker/schemas.js";

describe("describeIssuePath", () => {
  it.each<{ path: PropertyKey[]; expected: string }>([
    { path: ["Config", "Labels", "evil key\nINJECT"], expected: "Config.Labels.<key>" },
    { path: [1, "Labels", "k"], expected: "1.Labels.<key>" },
    { path: ["Volumes", 0, "Labels", "x".repeat(5000)], expected: "Volumes.0.Labels.<key>" },
    { path: ["Labels", "Labels"], expected: "Labels.<key>" },
    { path: [1, "Names", 1], expected: "1.Names.1" },
    { path: ["Config", "Image"], expected: "Config.Image" },
    { path: [], expected: "" },
  ])(
    "describeIssuePath replaces each label key with <key> and keeps field names and indices ($expected)",
    ({ path, expected }) => {
      const described = describeIssuePath(path);

      expect(described).toBe(expected);
    },
  );

  it("describeIssuePath prints a symbol segment as <key> instead of throwing", () => {
    const path = ["Labels", Symbol("s")];

    const described = describeIssuePath(path);

    expect(described).toBe("Labels.<key>");
  });
});
