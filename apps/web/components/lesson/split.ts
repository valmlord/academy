// The split of the two-pane lesson layout, as a percentage of the layout width given to the lesson pane
// (design/flows/lesson-environment.md F9.3, A8). Pure, so every rule is checked without layout.

/** The effective limits of the split, whole percentages, `min <= max`. */
export interface SplitRange {
  min: number;
  max: number;
}

// A8: never below 25 % or above 75 %, whatever the width.
const SPLIT_MIN_PERCENT = 25;
const SPLIT_MAX_PERCENT = 75;
// Both limits cross when the layout cannot hold two minimum panes; the split then stays even.
const FALLBACK_PERCENT = 50;

/** lesson-environment.md F9.3: a click or Enter steps 50 -> 35 -> 65 -> 50. */
export const SPLIT_PRESETS: readonly number[] = [50, 35, 65];

// proto.js `SPLIT_STEP`: one arrow key moves the split by 5 %.
const KEY_STEP_PERCENT = 5;

// lesson-environment.md:202: a press that moves less than 4 px is a click, not a drag.
const CLICK_SLOP_PX = 4;

/**
 * The limits for a layout `layoutWidthPx` wide: each pane keeps `paneMinPx` (20rem) beside the handle, and the
 * split stays within 25-75 %.
 */
export function splitRange(
  layoutWidthPx: number,
  paneMinPx: number,
  handleWidthPx: number,
): SplitRange {
  // When the widths are exact in binary (whole px or 1/64 px), multiplying by 100 before dividing leaves the
  // division as the only rounding, so a bound that is exactly a whole percent (a pane keeping exactly 20rem)
  // comes out as that whole number and rounding up or down cannot jump a percent. A fractional root font (17.6 px)
  // or page zoom (90 %, 110 %) makes the widths inexact, and a bound within about 1e-13 of a whole percent can then
  // still be off by one, as it could before. Dividing first gave 28.000000000000004 for 420 px of 1500 px, so the
  // minimum became 29 (#156).
  const min = Math.ceil(Math.max(SPLIT_MIN_PERCENT, (paneMinPx * 100) / layoutWidthPx));
  const max = Math.floor(
    Math.min(
      SPLIT_MAX_PERCENT,
      ((layoutWidthPx - handleWidthPx - paneMinPx) * 100) / layoutWidthPx,
    ),
  );
  if (min > max) return { min: FALLBACK_PERCENT, max: FALLBACK_PERCENT };
  return { min, max };
}

export function clampSplit(value: number, range: SplitRange): number {
  return Math.min(Math.max(value, range.min), range.max);
}

/**
 * The preset after `value`; a value that is no preset (after a free drag, or a clamped preset) starts the cycle
 * again at the first one.
 */
export function nextPreset(
  value: number,
  range: SplitRange,
  presets: readonly number[] = SPLIT_PRESETS,
): number {
  const index = presets.indexOf(value);
  const next = index === -1 ? presets[0] : presets[(index + 1) % presets.length];
  return clampSplit(next ?? FALLBACK_PERCENT, range);
}

/** The value a key sets, or `null` for a key the handle does not handle (its default action stays). */
export function keyedSplit(key: string, value: number, range: SplitRange): number | null {
  switch (key) {
    case "ArrowLeft":
      return clampSplit(value - KEY_STEP_PERCENT, range);
    case "ArrowRight":
      return clampSplit(value + KEY_STEP_PERCENT, range);
    case "Home":
      return range.min;
    case "End":
      return range.max;
    case "Enter":
      return nextPreset(value, range);
    default:
      return null;
  }
}

export function isClick(dxPx: number): boolean {
  return Math.abs(dxPx) < CLICK_SLOP_PX;
}

/** The split moves by the pointer's travel (design D-5), so a press without movement keeps the value. */
export function dragSplit(
  startValue: number,
  dxPx: number,
  layoutWidthPx: number,
  range: SplitRange,
): number {
  return clampSplit(Math.round(startValue + (dxPx / layoutWidthPx) * 100), range);
}
