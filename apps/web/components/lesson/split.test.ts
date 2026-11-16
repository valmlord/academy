// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  clampSplit,
  dragSplit,
  isClick,
  keyedSplit,
  nextPreset,
  type SplitRange,
  splitRange,
} from "./split";

// The split rules of design 2.4 (lesson-environment.md F9.3, A8): S1-S6.

// The pane minimum is 20rem and the handle column 1.5rem (proto.css `--pane-min`, `--handle-width`).
const PANE_MIN_REM = 20;
const HANDLE_REM = 1.5;
const FULL = { min: 25, max: 75 };

// Every comparison is scaled by 100 so that each term is an exact integer (or a multiple of 0.5) on the tested
// widths and fonts. `value / 100 * width` rounds, which put a terminal of exactly 20rem on the wrong side (#156).
function expectWidestSafeRange(width: number, rootFontPx: number, range: SplitRange): void {
  const paneMin = PANE_MIN_REM * rootFontPx;
  const handle = HANDLE_REM * rootFontPx;
  const { min, max } = range;

  expect(Number.isInteger(min) && Number.isInteger(max)).toBe(true);
  expect(min).toBeLessThanOrEqual(max);
  expect(min).toBeGreaterThanOrEqual(25);
  expect(max).toBeLessThanOrEqual(75);
  const limits: ReadonlyArray<readonly [string, number]> = [
    ["min", min],
    ["max", max],
  ];
  for (const [limit, value] of limits) {
    expect(value * width, `${limit} ${value} leaves the lesson under 20rem`).toBeGreaterThanOrEqual(
      paneMin * 100,
    );
    expect(value * width, `${limit} ${value} leaves the terminal under 20rem`).toBeLessThanOrEqual(
      (width - handle - paneMin) * 100,
    );
  }
  // At 75 and 25 the clamp sets the limit, not a pane minimum, so a wider or narrower split may still fit there.
  if (max < 75) {
    expect(
      (max + 1) * width,
      `max ${max} is not the widest: ${max + 1} still leaves the terminal 20rem`,
    ).toBeGreaterThan((width - handle - paneMin) * 100);
  }
  if (min > 25) {
    expect(
      (min - 1) * width,
      `min ${min} is not the narrowest: ${min - 1} still leaves the lesson 20rem`,
    ).toBeLessThan(paneMin * 100);
  }
}

describe("splitRange", () => {
  it("gives the widest whole limits within 25-75 % that leave both panes their minimum at either end (S1)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1024, max: 4000 }),
        fc.integer({ min: 16, max: 24 }),
        (width, rootFontPx) => {
          const range = splitRange(width, PANE_MIN_REM * rootFontPx, HANDLE_REM * rootFontPx);

          expectWidestSafeRange(width, rootFontPx, range);
        },
      ),
    );
  });

  it("gives 25-73 % at 1280 px and 32-66 % at 1024 px with a 16 px root font (S2)", () => {
    expect(splitRange(1280, 320, 24)).toEqual({ min: 25, max: 73 });
    expect(splitRange(1024, 320, 24)).toEqual({ min: 32, max: 66 });
  });

  it("accepts a limit that leaves the terminal exactly 20rem at 1075 px with a 22 px root font", () => {
    const width = 1075;
    const rootFontPx = 22;

    const range = splitRange(width, PANE_MIN_REM * rootFontPx, HANDLE_REM * rootFontPx);

    expectWidestSafeRange(width, rootFontPx, range);
    expect(range).toEqual({ min: 41, max: 56 });
  });

  it("reaches 57 % at 1050 px with a 21 px root font, where the terminal keeps exactly 20rem", () => {
    const width = 1050;
    const rootFontPx = 21;

    const range = splitRange(width, PANE_MIN_REM * rootFontPx, HANDLE_REM * rootFontPx);

    expectWidestSafeRange(width, rootFontPx, range);
    expect(range).toEqual({ min: 40, max: 57 });
  });

  it("goes down to 28 % at 1500 px with a 21 px root font, where the lesson keeps exactly 20rem", () => {
    const width = 1500;
    const rootFontPx = 21;

    const range = splitRange(width, PANE_MIN_REM * rootFontPx, HANDLE_REM * rootFontPx);

    expectWidestSafeRange(width, rootFontPx, range);
    expect(range).toEqual({ min: 28, max: 69 });
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
