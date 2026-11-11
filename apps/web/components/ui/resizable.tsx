"use client";

import type * as React from "react";
import { type PointerEvent, type KeyboardEvent as ReactKeyboardEvent, useRef } from "react";
import {
  dragSplit,
  isClick,
  keyedSplit,
  nextPreset,
  type SplitRange,
} from "@/components/lesson/split";
import { useTooltip } from "@/components/ui/tooltip";

// Mirrors design/system/proto.css `.resizable-handle` and `.resizable-handle-grip`, written in the app (D5; ADR-0003
// amendment #106): the separator between the lesson panes, with proto.js's pointer and key rules. No `flex` or
// `hidden` in its classes: the lesson layout's unlayered CSS sets its `display` per width (#106 design 2.2.3), and
// a utility for the same property would compete with it. No double-click handler: two presses on the handle cycle
// twice.

export interface ResizableHandleProps {
  /** The lesson pane's share of the layout, in whole percent. */
  value: number;
  range: SplitRange;
  onValueChange(value: number): void;
  label: string;
  /** The tooltip's text, which is also the handle's accessible description. */
  tooltip: string;
  /** The layout's current width in px, read when a drag moves. */
  layoutWidth(): number;
}

interface Drag {
  pointerId: number;
  startX: number;
  startValue: number;
  isMoved: boolean;
}

// A primary-button press (PointerEvent.button 0); a right or middle press starts no drag.
const PRIMARY_BUTTON = 0;

const HANDLE_CLASS_NAME =
  "resizable-handle group relative z-[1] min-w-6 cursor-col-resize touch-none items-center justify-center bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-border before:content-['']";

export function ResizableHandle({
  value,
  range,
  onValueChange,
  label,
  tooltip,
  layoutWidth,
}: ResizableHandleProps): React.JSX.Element {
  const dragRef = useRef<Drag | null>(null);
  const { anchorProps, tipProps } = useTooltip();

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    anchorProps.onPointerDown();
    if (event.button !== PRIMARY_BUTTON) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: value,
      isMoved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!drag.isMoved && isClick(dx)) return;
    drag.isMoved = true;
    onValueChange(dragSplit(drag.startValue, dx, layoutWidth(), range));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.isMoved) onValueChange(nextPreset(value, range));
    // proto.js: the handle takes focus after a press, so the keys work next.
    event.currentTarget.focus();
  }

  function onPointerCancel(): void {
    dragRef.current = null;
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    anchorProps.onKeyDown(event);
    const next = keyedSplit(event.key, value, range);
    if (next === null) return;
    event.preventDefault();
    onValueChange(next);
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={value}
      aria-valuetext={`${value} %`}
      aria-describedby={anchorProps["aria-describedby"]}
      className={HANDLE_CLASS_NAME}
      onPointerEnter={anchorProps.onPointerEnter}
      onPointerLeave={anchorProps.onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onFocus={anchorProps.onFocus}
      onBlur={anchorProps.onBlur}
      onKeyDown={onKeyDown}
    >
      <span
        aria-hidden
        className="relative h-6 w-3 rounded-sm border border-input bg-background group-hover:border-ring group-focus-visible:border-ring"
      />
      <span {...tipProps}>{tooltip}</span>
    </div>
  );
}
