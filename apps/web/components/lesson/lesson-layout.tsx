"use client";

import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type { EnvironmentAttention } from "@/components/environment/status-view";
import { SHOW_PANE_EVENT } from "@/components/region-cycle";
import { ResizableHandle } from "@/components/ui/resizable";
import { splitHandleLabel, splitHandleTooltip } from "@/lib/copy";
import {
  isLessonPane,
  LessonLayoutContext,
  type LessonLayoutContextValue,
  type ShowPaneOptions,
} from "./lesson-layout-context";
import { LESSON_PANE_IDS, type LessonPane } from "./lesson-panels";
import { clampSplit, type SplitRange, splitRange } from "./split";

// The lesson page with an environment (#106 design 2.2): `main.lesson-layout`, a CSS grid whose columns and
// one-pane rules live in the unlayered block of globals.css. Both panes stay mounted at every width, so the
// terminal session survives the 64rem breakpoint; below it `data-active-pane` picks the pane shown. The split is
// applied as `--split-left` by an effect, so the server render and the first client render are the same.

export interface LessonLayoutProps {
  lesson: ReactNode;
  environment: ReactNode;
}

// lesson-environment.md F9.3: the split starts even and is not remembered.
const DEFAULT_SPLIT_PERCENT = 50;
// proto.css `--pane-min`: each pane keeps at least 20rem beside the handle.
const PANE_MIN_REM = 20;
// Until the layout is measured after mount, the separator announces the A8 limits.
const UNMEASURED_RANGE: SplitRange = { min: 25, max: 75 };

/** The same-valued tab inside the switch of the pane `pane` (proto.js: the twin of the tab just used). */
function twinTab(pane: LessonPane): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-pane="${pane}"] .pane-switch [role="tab"][aria-controls="${LESSON_PANE_IDS[pane]}"]`,
  );
}

/**
 * The layout's shared state. Shown panes change synchronously (`flushSync`), so a focus that follows in the same
 * event handler lands in the pane that is now laid out; callers run outside React's commit (event handlers).
 */
export function useLessonLayoutState(): LessonLayoutContextValue {
  const [activePane, setActivePane] = useState<LessonPane>("lesson");
  const [environmentAttention, setEnvironmentAttention] = useState<EnvironmentAttention | null>(
    null,
  );
  const showPane = useCallback((pane: LessonPane, options?: ShowPaneOptions): void => {
    flushSync(() => setActivePane(pane));
    if (options?.focusTwin === true) twinTab(pane)?.focus();
  }, []);
  return useMemo(
    () => ({ activePane, showPane, environmentAttention, setEnvironmentAttention }),
    [activePane, showPane, environmentAttention],
  );
}

/** The split limits for the layout as it is laid out now: its width, the root font size and the handle. */
function measuredRange(main: HTMLElement): SplitRange {
  const rootFontPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const handle = main.querySelector<HTMLElement>(":scope > .resizable-handle");
  return splitRange(
    main.getBoundingClientRect().width,
    PANE_MIN_REM * rootFontPx,
    handle?.getBoundingClientRect().width ?? 0,
  );
}

/** The pane a `SHOW_PANE_EVENT` names, or null for any detail that names none. */
function shownPaneOf(event: Event): LessonPane | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail: unknown = event.detail;
  if (typeof detail !== "object" || detail === null) return null;
  const pane: unknown = Reflect.get(detail, "pane");
  return isLessonPane(pane) ? pane : null;
}

export function LessonLayout({ lesson, environment }: LessonLayoutProps): ReactElement {
  const context = useLessonLayoutState();
  const { activePane, showPane } = context;
  const mainRef = useRef<HTMLElement>(null);
  const [split, setSplit] = useState(DEFAULT_SPLIT_PERCENT);
  const [range, setRange] = useState<SplitRange>(UNMEASURED_RANGE);

  useEffect(() => {
    mainRef.current?.style.setProperty("--split-left", `${split}%`);
  }, [split]);

  // The region cycle asks for a hidden pane before it focuses into it (design 2.6); the detail is untrusted.
  useEffect(() => {
    const main = mainRef.current;
    if (main === null) return;
    function onShowPane(event: Event): void {
      const pane = shownPaneOf(event);
      if (pane !== null) showPane(pane);
    }
    main.addEventListener(SHOW_PANE_EVENT, onShowPane);
    return () => main.removeEventListener(SHOW_PANE_EVENT, onShowPane);
  }, [showPane]);

  // A window resize changes the limits; a value outside them is clamped, and a clamped value that is no preset
  // makes the next click go to 50 (split.ts nextPreset).
  useEffect(() => {
    const main = mainRef.current;
    if (main === null) return;
    const observer = new ResizeObserver(() => {
      const next = measuredRange(main);
      setRange((current) =>
        current.min === next.min && current.max === next.max ? current : next,
      );
      setSplit((value) => clampSplit(value, next));
    });
    observer.observe(main);
    return () => observer.disconnect();
  }, []);

  const layoutWidth = useCallback(() => mainRef.current?.getBoundingClientRect().width ?? 0, []);

  return (
    <LessonLayoutContext value={context}>
      <main
        ref={mainRef}
        id="main"
        tabIndex={-1}
        className="lesson-layout"
        data-active-pane={activePane}
      >
        {lesson}
        <ResizableHandle
          value={split}
          range={range}
          onValueChange={setSplit}
          label={splitHandleLabel}
          tooltip={splitHandleTooltip}
          layoutWidth={layoutWidth}
        />
        {environment}
      </main>
    </LessonLayoutContext>
  );
}
