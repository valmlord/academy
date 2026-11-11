// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clampSplit, dragSplit, isClick, keyedSplit, nextPreset, splitRange } from "./split";

// The split rules of design 2.4 (lesson-environment.md F9.3, A8): S1-S6.

// The pane minimum is 20rem and the handle column 1.5rem (proto.css `--pane-min`, `--handle-width`).
const PANE_MIN_REM = 20;
const HANDLE_REM = 1.5;
const FULL = { min: 25, max: 75 };

describe("splitRange", () => {
  it("gives whole limits within 25-75 % that leave both panes their minimum at either end (S1)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1024, max: 4000 }),
        fc.integer({ min: 16, max: 24 }),
        (width, rootFontPx) => {
          const paneMin = PANE_MIN_REM * rootFontPx;
          const handle = HANDLE_REM * rootFontPx;

          const range = splitRange(width, paneMin, handle);

          expect(Number.isInteger(range.min) && Number.isInteger(range.max)).toBe(true);
          expect(range.min).toBeLessThanOrEqual(range.max);
          expect(range.min).toBeGreaterThanOrEqual(25);
          expect(range.max).toBeLessThanOrEqual(75);
          for (const value of [range.min, range.max]) {
            const lesson = (value / 100) * width;
            expect(lesson).toBeGreaterThanOrEqual(paneMin);
            expect(width - handle - lesson).toBeGreaterThanOrEqual(paneMin);
          }
        },
      ),
    );
  });

  it("gives 25-73 % at 1280 px and 32-66 % at 1024 px with a 16 px root font (S2)", () => {
    expect(splitRange(1280, 320, 24)).toEqual({ min: 25, max: 73 });
    expect(splitRange(1024, 320, 24)).toEqual({ min: 32, max: 66 });
  });
});

describe("nextPreset", () => {
  it("cycles 50, 35, 65 and starts again at 50 from a value that is no preset (S3)", () => {
    expect(nextPreset(50, FULL)).toBe(35);
    expect(nextPreset(35, FULL)).toBe(65);
    expect(nextPreset(65, FULL)).toBe(50);
    expect(nextPreset(47, FULL)).toBe(50);
    expect(nextPreset(55, FULL)).toBe(50);
  });
});

describe("keyedSplit", () => {
  it("moves by 5 within the range on the arrows, jumps to the limits on Home and End, cycles on Enter (S4)", () => {
    const range = { min: 32, max: 66 };

    expect(keyedSplit("ArrowRight", 50, range)).toBe(55);
    expect(keyedSplit("ArrowLeft", 50, range)).toBe(45);
    expect(keyedSplit("ArrowRight", 64, range)).toBe(66);
    expect(keyedSplit("ArrowLeft", 34, range)).toBe(32);
    expect(keyedSplit("Home", 50, range)).toBe(32);
    expect(keyedSplit("End", 50, range)).toBe(66);
    expect(keyedSplit("Enter", 50, range)).toBe(35);
    expect(keyedSplit("Tab", 50, range)).toBeNull();
  });
});

describe("isClick", () => {
  it("takes a travel below 4 px as a click, in either direction (S5)", () => {
    expect(isClick(3)).toBe(true);
    expect(isClick(4)).toBe(false);
    expect(isClick(-4)).toBe(false);
  });
});

describe("dragSplit", () => {
  it("keeps the clamped start value when the pointer has not moved (S6)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1024, max: 4000 }),
        fc.integer({ min: 25, max: 50 }),
        fc.integer({ min: 50, max: 75 }),
        (value, width, min, max) => {
          const range = { min, max };

          expect(dragSplit(value, 0, width, range)).toBe(clampSplit(value, range));
        },
      ),
    );
  });
});
