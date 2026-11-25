// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type CourseElementPart, courseElementId } from "./element-id";

const PARTS: readonly CourseElementPart[] = ["heading", "line", "error-title"];
const SLUG_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");

/** Names in the course id form: non-empty runs of `[a-z0-9]` joined by `-`. */
const slugName = fc
  .array(fc.string({ unit: fc.constantFrom(...SLUG_CHARACTERS), minLength: 1 }), { minLength: 1 })
  .map((runs) => runs.join("-"));
/** Any well-formed string (no lone surrogate), mixed with slug names so both kinds of token meet. */
const anyName = fc.oneof(slugName, fc.string({ unit: "binary" }));
const part = fc.constantFrom(...PARTS);

describe("courseElementId", () => {
  it("keeps an id-form course id as the token for every part", () => {
    fc.assert(
      fc.property(slugName, part, (name, elementPart) => {
        expect(courseElementId(name, elementPart)).toBe(`course-${name}-${elementPart}`);
      }),
    );
  });

  it("never gives two different (name, part) pairs the same id", () => {
    fc.assert(
      fc.property(anyName, part, anyName, part, (name, elementPart, otherName, otherPart) => {
        fc.pre(name !== otherName || elementPart !== otherPart);
        expect(courseElementId(name, elementPart)).not.toBe(courseElementId(otherName, otherPart));
      }),
    );
  });

  it("gives ids of letters, digits, - and _ only, starting with course-", () => {
    fc.assert(
      fc.property(anyName, part, (name, elementPart) => {
        expect(courseElementId(name, elementPart)).toMatch(/^course-[a-z0-9_-]+$/);
      }),
    );
  });

  it.each([
    ["Zed", "zed"],
    ["a b", "a-b"],
    ["a b", "a_b"],
    ["a-b", "a_b"],
    ["_5a6564", "Zed"],
  ])("gives %o and %o different ids", (name, otherName) => {
    expect(courseElementId(name, "heading")).not.toBe(courseElementId(otherName, "heading"));
  });

  it("encodes a directory name outside the id form as _ and the hex of its UTF-8 bytes", () => {
    expect(courseElementId("Zed", "heading")).toBe("course-_5a6564-heading");
  });

  it("keeps the course id error as an ordinary token", () => {
    expect(courseElementId("error", "heading")).toBe("course-error-heading");
  });

  it("encodes a 255-byte non-ASCII directory name into two hex digits per byte", () => {
    const name = `${"ж".repeat(127)}a`;

    const id = courseElementId(name, "line");

    expect(id).toBe(`course-_${"d0b6".repeat(127)}61-line`);
  });
});
